import * as rpio from 'rpio';
import * as config from 'config';
import { EventManager } from './EventManager';

class Pin {
  public state: string;
  constructor(public address: number, public label: string, public mode: string) {
  }
}
export class GpioService {

  knownPins: Pin[] = [];

  constructor(private eventManager: EventManager) {
    let self = this;

    // initialize the pins.
    for (let i = 1; i <= 26; i++) {
      let key = 'gpio.pins.' + i;
      if (config.has(key)) {
        let mode = config.get(key + '.mode') as string;
        let label = config.get(key + '.label') as string;
        // console.log('found pin config ' + i + ' ' + mode + ' ' + label);
        if ('digitaloutput' === mode) {
          rpio.open(i, rpio.OUTPUT, rpio.LOW);
          let p = new Pin(i, label, mode);
          // console.log('push pin ' + JSON.stringify(p));
          this.knownPins.push(p);
        }
        else if ('digitalinput' === mode) {
          rpio.open(i, rpio.INPUT, rpio.PULL_DOWN);
          let p = new Pin(i, label, mode);
          // console.log('push pin ' + JSON.stringify(p));
          this.knownPins.push(p);
          rpio.poll(i, (pin) => {
            let oldstate = p.state;
            p.state = rpio.read(pin) === 1 ? 'HIGH' : 'LOW';
            let now = new Date();
            console.log(now + ' pin ' + pin + ' was ' + oldstate + ' and is now in state ' + p.state);
            let json = {
              'status': 'success',
              'event': {
                'eventtype': 'gpio',
                'ts': now.toJSON(),
                'pin': label,
                'state': p.state
              }
            };
            if (oldstate !== p.state) {
              self.eventManager.processEvent(JSON.stringify(json));
            }
          });
        }
        else {
          console.log('error: unknown pin mode ' + mode);
        }
      }
    }
  }

  shutdown() {

  }

  getStateForAll(): Pin[] {
    this.knownPins.forEach(p => {
      p.state = (rpio.read(p.address) === 1) ? 'HIGH' : 'LOW';
    });
    return this.knownPins;
  }

  getState(pinlabel: string): Pin {
    let p = this.knownPins.find(p => p.label === pinlabel);
    if (p) {
      p.state = (rpio.read(p.address) === 1) ? 'HIGH' : 'LOW';
    }
    return p;
  }

  setPin(pinlabel: string, pinstatehigh: boolean) {
    console.log('set pin ' + pinlabel + ' to state high=' + pinstatehigh);
    let pin = this.knownPins.find(p => p.label === pinlabel);
    if (pin) {
      rpio.write(pin.address, pinstatehigh ? rpio.HIGH : rpio.LOW);
    }
    else {
      console.error('unknown pin ' + pinlabel);
    }
  }
}
