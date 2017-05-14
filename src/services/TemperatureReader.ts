import * as config from 'config';
import * as Rx from 'rx';
import * as child from 'child_process';
import * as fs from 'fs';

export class Reading {
  public device: string;
  public df: number;
  public dc: number;
  public msg?: string;
}

export class TemperatureReader {

  sensors: string[];

  constructor() {
    this.sensors = config.get('temp.sensors') as string[];
    console.log('configured sensors are ' + this.sensors);
    this.exec('modprobe w1-gpio');
    this.exec('modprobe w1-therm');
    this.exec('ls /sys/bus/w1/devices');
  }

  getAll(): Rx.Observable<Reading> {
    return Rx.Observable.create<Reading>(o => {
      let done = 0;
      this.sensors.forEach(sensor => {
        let devicekey = config.get('temp.' + sensor);
        let filename = '/sys/bus/w1/devices/' + devicekey + '/w1_slave';
        let ls: child.ChildProcess = child.exec('cat ' + filename);
        let output = [];
        ls.stdout.on('data', (data) => {
          console.log(`temp stdout: ${data}`);
          let d = data as string;
          d.split('\n').forEach(s => output.push(s));
        });
        ls.on('close', (code) => {
          o.onNext(this.convertMeasurement(sensor, output));
          done = done + 1;
          if (done === this.sensors.length) {
            o.onCompleted();
          }
        });
      });
    });
  }

  convertMeasurement(sensor: string, lines: string[]): Reading {
    let r = new Reading();
    r.device = sensor;
    if (lines.length >= 2) {
      let idx = lines[1].lastIndexOf('=');
      if (idx <= 0) {
        console.log('error - unexpected content ' + lines.join());
        r.msg = lines.join();
      }
      else {
        let reading = lines[1].substring(idx + 1);
        r.dc = parseFloat(reading) / 1000.0;
        r.df = r.dc * 9.0 / 5.0 + 32.0;
      }
    }
    else {
      console.log('error - unexpected content ' + lines.join());
      r.msg = lines.join();
    }
    return r;
  }

  exec(cmd: string) {
    console.log('invoke ' + cmd + ' child process');
    let ls: child.ChildProcess = child.exec(cmd);
    ls.stdout.on('data', (data) => {
      // console.log(`stdout: ${data}`);
    });

    ls.stderr.on('data', (data) => {
      // console.log(`stderr: ${data}`);
    });

    ls.on('close', (code) => {
      console.log('child process \'' + cmd + '\' exited with code ' + code);
    });
  }
}
