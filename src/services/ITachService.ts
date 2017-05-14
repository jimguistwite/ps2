import * as d3 from 'd3';
import * as async from 'async';
import * as net from 'net';
import * as config from 'config';
import * as Rx from 'rx';

export class IrCommand {
  constructor(public device: string, public action: string,
    public location: string, public ircode?: string) {

  }
}

export class IrCommandList {
  commands: IrCommand[];
}

export class QueueItem {
  irc: IrCommand;
  cmd: string;
  callback: any;

  constructor(public svc: ITachService, public o: Rx.Observer<string>) {

  }
}

export class ITachService {

  private client: net.Socket;
  private q: any = null;
  private outstandingRequest: QueueItem;

  fct(task: QueueItem, callback) {
    task.callback = callback;
    task.svc.outstandingRequest = task;
    if (task.cmd) {
      task.svc.client.write(task.cmd);
    }
    else if (task.irc) {
      let rnd = Math.floor(Math.random() * 65535) + 1;
      let addr = config.get('ir.' + task.irc.device + '.address');
      if (!addr) {
        addr = '1:3';
      }
      if (task.irc.ircode) {
        let cmd = 'sendir,' + addr + ',' + rnd + ',' + task.irc.ircode + '\r';
        console.log('sending ' + cmd);
        task.svc.client.write(cmd);
      }
      else {
        let seq = config.get('ir.' + task.irc.device + '.' + task.irc.action);
        if (seq) {
          // do we need to wait before sending the command?
          let pkey = 'ir.pause.' + task.irc.device + '.' + task.irc.action;

          if (config.has(pkey)) {
            let delay = config.get(pkey);
            // console.log('delay for ' + delay + 'ms before send');
            setTimeout((s) => {
              let cmd = 'sendir,' + addr + ',' + rnd + ',' + s + '\r';
              console.log('sending ' + cmd);
              task.svc.client.write(cmd);
            }, delay, seq);
          }
          else {
            let cmd = 'sendir,' + addr + ',' + rnd + ',' + seq + '\r';
            console.log('sending ' + cmd);
            task.svc.client.write(cmd);
          }
        }
        else {
          console.log('error: no ir code found matching key ' + task.irc.device + '.' + task.irc.action);
          task.svc.outstandingRequest = null;
        }
      }
    }
  }

  getNetworkStatus(): Rx.Observable<string> {
    return Rx.Observable.create<string>(o => {
      let qi = new QueueItem(this, o);
      qi.cmd = 'get_NET,0:1\r';
      this.q.push(qi,
        err => {
          if (err) {
            console.log('queue error: ' + err);
          }
        });
    });
  }

  send(cl: IrCommandList): Rx.Observable<string> {
    return Rx.Observable.create<string>(o => {
      cl.commands.forEach(c => {
        let qi = new QueueItem(this, o);
        qi.irc = c;
        // console.log('push queue item ' + JSON.stringify(qi.irc));
        this.q.push(qi,
          err => {
            if (err) {
              console.log('queue error: ' + err);
            }
          });
      });
    });
  }

  shutdown() {
    if (this.client) {
      this.client.destroy();
    }
  }

  constructor() {
    let host = config.get('itach.host') as string;
    let port = config.get('itach.port') as number;
    this.q = async.queue(this.fct, 1);

    this.client = net.connect(port, host, function () {
      console.log('CONNECTED TO: ' + host + ':' + port);
    });
    this.client.setEncoding('UTF-8');

    let self = this;

    this.client.on('data', function (data) {
      console.log('socket input: ' + data);
      let req = self.outstandingRequest;
      self.outstandingRequest = null;
      if (req) {
        req.o.onNext('' + data);
        req.o.onCompleted();

        if (req.callback) {
          req.callback();
        }
      }
    });

    // Add a 'close' event handler for the client socket
    this.client.on('close', function () {
      console.log('Connection closed');
    });
  }
}
