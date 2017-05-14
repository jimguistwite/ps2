import * as async from 'async';
import * as config from 'config';
import * as Rx from 'rx';
import * as child from 'child_process';
import { EventManager } from './EventManager';
import * as bunyan from 'bunyan';

/**
 * CM11A X10 interface controller
 */

export class Task {
  callback: any;
  constructor(public svc: CM11A, public o: Rx.Observer<string>, public houseCodeAndUnit?: string, public fct?: any) {

  }
}

type TextTransformer = (string) => string;

export class CM11A {

  private q: any = null;
  private heyu: string;
  private log: any;

  constructor(private eventManager: EventManager) {
    this.log = bunyan.createLogger({name: 'CM11A'});

    this.q = async.queue(this.fct, 1);
    this.heyu = config.get('heyu') as string;



    this.monitor();

    child.exec(this.heyu + ' start');
  }

  fct(task: Task, callback: any) {
    task.callback = callback;
    let cmd = task.svc.heyu + ' ' + task.fct + ' ' + task.houseCodeAndUnit;
    task.svc.exec(cmd, task);
  }

  x10(houseCodeUnit: string, fct: string): Rx.Observable<string> {
    this.log()
    return Rx.Observable.create<string>(o => {
      let task = new Task(this, o, houseCodeUnit, fct);
      this.q.push(task,
        err => {
          if (err) {
            console.log('queue error: ' + err);
          }
        });
    });
  }

  getState(): Rx.Observable<any> {
    let cmd = this.heyu + ' show h';
    return Rx.Observable.create<string>(ob => {
      let task = new Task(this, ob);
      this.exec(cmd, task);
    }).flatMap(s => {
      let devicesOn = [];
      // console.log('getstate got ' + s);
      let lines = s.split('\n');
      lines.forEach(line => {
        line = line.trim();
        // console.log('line is \'' + line + '\'');
        if (line.indexOf('Housecode') >= 0) {
          let sp = line.indexOf(' ');
          let house = line.substring(sp + 1, sp + 2);
          // console.log('house is ' + house);
          let lp = line.indexOf('(');
          let rp = line.indexOf(')');
          let stats = line.substring(lp + 1, rp);
          // console.log('stats are \'' + stats + '\'');
          for (let idx = 0; idx < stats.length; idx++) {
            if ('*' === stats[idx]) {
              devicesOn.push(house + '' + idx);
            }
          }
        }
      });
      let know = config.get('knownX10codes') as string[];
      return know.map(k => {
        let on = devicesOn.indexOf(k) >= 0;
        let json = {
          'code': k,
          'status': on ? 'on' : 'off'
        };
        // return JSON.stringify(json);
        return json;
      });
    });
  }

  /**
   * Run heyu in monitor mode as a child process and process its output.
   */
  monitor() {
    let cmd = this.heyu + ' monitor';
    // create a task...
    let o = Rx.Observable.create<string>(ob => {
      let task = new Task(this, ob);
      let pendingCodeAndUnit: string;
      this.exec(cmd, task, input => {
        let output = input as string;
        let items = output.split(' ').map(s => s.trim()).filter(s => s.length !== 0);
        // console.log('items: ' + items);
        if ('addr' === items[3]) {
          pendingCodeAndUnit = items[8];
          output = null;
        }
        else if (('func' === items[3]) && (pendingCodeAndUnit !== undefined)) {
          let now = new Date();
          let dt = new Date(items[0] + ' ' + items[1]);
          dt.setFullYear(now.getFullYear());
          let json = {
            'status': 'success',
            'event': {
              'eventtype': 'x10',
              'ts': dt.toJSON(),
              'code': pendingCodeAndUnit,
              'function': items[4].toLowerCase()
            }
          };
          output = JSON.stringify(json);
        }
        else if (output.indexOf('Monitor started')) {
          output = null; // ignore
        }
        else {
          console.log('error: cannot process ' + output);
          output = null;
        }
        return output;
      });
    });
    o.subscribe((v) => {
      if (v) {
        console.log('call event manager with ' + v);
        this.eventManager.processEvent(v);
      }
    },
      err => {
        console.log('heyu monitor produced error' + err);
        if (err.stack) {
          console.log(err.stack);
        }
      },
      () => {
        console.log('heyu monitor task completed');
      });
  }


  shutdown() {

  }

  exec(cmd: string, task: Task, tt?: TextTransformer) {
    console.log('invoke ' + cmd + ' child process');
    let ls: child.ChildProcess = child.exec(cmd);
    ls.stdout.on('data', (data) => {
      // console.log(`stdout: ${data}`);
      let v = '' + data;
      if (tt) {
        v = tt(v);
      }
      task.o.onNext(v);
    });

    ls.stderr.on('data', (data) => {
      console.log(`stderr: ${data}`);
      task.o.onError('' + data);
    });

    ls.on('close', (code) => {
      // console.log('child process \'' + cmd + '\' exited with code ' + code);
      task.o.onCompleted();
      if (task.callback) {
        task.callback();
      }
    });
  }

}
