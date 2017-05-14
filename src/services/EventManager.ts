import * as http from 'http';
import * as config from 'config';
import * as request from 'request';

class Listener {
  constructor(public name: string, public url: string) {

  }
}

export class EventManager {

  listeners: Listener[] = [];

  constructor() {
    let hubaddress = config.get('smartthingshub') as string;
    this.listeners.push(new Listener('hub', hubaddress));
  }

  processEvent(event: string) {
    // console.log('process event ' + event);
    this.listeners.forEach(listener => {
      request.post(listener.url, { json: JSON.parse(event) },
        function (error, response, body) {
          if (!error && response.statusCode === 200) {
            console.log(body);
          }
          if (error) {
            console.log('error in post to ' + listener.name);
            if (error.stack) {
              console.log(error.stack);
            }
          }
        }
      );
    });
  }
}
