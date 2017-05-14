import * as bodyParser from 'body-parser';
import * as express from 'express';
import * as bunyan from 'bunyan';
import * as path from 'path';
import { NextFunction, Request, Response, Router } from 'express';
import { IndexRoute } from './routes/index';
import { ITachService, IrCommandList } from './services/ITachService';
import { TemperatureReader } from './services/TemperatureReader';
import { CM11A } from './services/CM11A';
import { EventManager } from './services/EventManager';
import { GpioService } from './services/GpioService';

import * as errorHandler from 'errorhandler';
import * as methodOverride from 'method-override';


/**
 * The server.
 *
 * @class Server
 */
export class Server {

  public app: express.Application;

  private eventManager: EventManager;
  private itach: ITachService;
  private temperatureReader: TemperatureReader;
  private cm11a: CM11A;
  private gpio: GpioService;

  /**
   * Bootstrap the application.
   *
   * @class Server
   * @method bootstrap
   * @static
   * @return {ng.auto.IInjectorService} Returns the newly created injector for this app.
   */
  public static bootstrap(): Server {
    return new Server();
  }

  /**
   * Constructor.
   *
   * @class Server
   * @constructor
   */
  constructor() {
    // create expressjs application
    this.app = express();

    this.services();

    // configure application
    this.config();

    // add routes
    this.routes();

    // add api
    this.api();
  }

  private services() {
    this.eventManager = new EventManager();
    this.itach = new ITachService();
    this.temperatureReader = new TemperatureReader();
    this.cm11a = new CM11A(this.eventManager);
    this.gpio = new GpioService(this.eventManager);
  }

  /**
   * Create REST API routes
   *
   * @class Server
   * @method api
   */
  public api() {
    let router: express.Router;
    router = express.Router();

    router.get('/api/', (req: Request, res: Response, next: NextFunction) => {
      res.json({ message: 'hooray! welcome to our api!' });
    });

    router.get('/api/itachnet', (req: Request, res: Response, next: NextFunction) => {
      this.itach.getNetworkStatus().subscribe(v => {
        res.json({ 'rsp': v });
      },
        error => {
          res.json({ 'error': error });
        });
    });

    router.post('/api/sendir', (req: Request, res: Response, next: NextFunction) => {
      let cmds = req.body as IrCommandList;
      // console.log('commands ' + JSON.stringify(cmds));
      // console.log('body ' + JSON.stringify(req.body));
      this.itach.send(cmds).subscribe(v => {
        res.json({ 'rsp': v });
      },
        error => {
          console.log('caught error ' + error);
          if (error.stack) {
            console.log(error.stack);
          }
          if (error) {
            res.json({ 'error': error });
          }
        });
    });

    /*
    router.get('/api/x10', (req: Request, res: Response, next: NextFunction) => {
       res.json({ 'status': 'success', 'x10state': [] });
    });
    */

    router.post('/api/x10', (req: Request, res: Response, next: NextFunction) => {
      let hcu = req.body.housecodeunit;
      let fct = req.body.function;
      let status = 'success';
      let message: string;
      let results: string[] = [];
      this.cm11a.x10(hcu, fct).subscribe(data => {
        results.push(data);
      },
        err => {
          console.log('error: ' + err);
          status = 'failed';
          message = '' + err;
        },
        () => {
          res.json({ 'status': status, 'message': message, 'results': results });
        });
    });

    router.get('/api/x10', (req: Request, res: Response, next: NextFunction) => {
      let status = 'success';
      let results = [];
      this.cm11a.getState().subscribe(data => {
        results.push(data);
      },
        err => {
          console.log('error: ' + err);
          res.json({ 'status': status, 'message': '' + err });
        },
        () => {
          res.json({ 'status': status, 'x10state': results });
        });
    });

    router.get('/api/temp', (req: Request, res: Response, next: NextFunction) => {
      let temperatures = [];
      let status = 'success';
      let message: string;
      this.temperatureReader.getAll().subscribe(reading => {
        temperatures.push({
          'c': reading.dc,
          'f': reading.df,
          'sensor': reading.device,
          'msg': reading.msg
        });
      },
        err => {
          console.log('error: ' + err);
          status = 'failed';
          message = '' + err;
        },
        () => {
          res.json({ 'status': status, 'message': message, 'temperature': temperatures });
        });
    });

    router.get('/api/temp/:sensor', (req: Request, res: Response, next: NextFunction) => {
      let temperatures = [];
      let status = 'success';
      let message: string;
      let sensor = req.params.sensor;
      this.temperatureReader.getAll().subscribe(reading => {
        if (reading.device === sensor) {
          temperatures.push({
            'c': reading.dc,
            'f': reading.df,
            'sensor': reading.device,
            'msg': reading.msg
          });
        }
      },
        err => {
          console.log('error: ' + err);
          status = 'failed';
          message = '' + err;
        },
        () => {
          res.json({ 'status': status, 'message': message, 'temperature': temperatures });
        });
    });

    router.get('/api/gpiostate', (req: Request, res: Response, next: NextFunction) => {
      let status = 'success';
      let message: string;
      let pins = this.gpio.getStateForAll();
      res.json({ 'status': 'success', 'gpiostate': pins });
    });


    router.get('/api/gpiostate/:id', (req: Request, res: Response, next: NextFunction) => {
      let status = 'success';
      let message: string;
      let pin = this.gpio.getState(req.params.id);
      if (pin) {
        res.json({ 'status': 'success', 'gpiostate': pin });
      }
      else {
        res.json({ 'status': 'failed', 'message': 'no pin with label ' + req.params.id });
      }
    });

    router.post('/api/gpioset', (req: Request, res: Response, next: NextFunction) => {
      let pin = req.body.pin;
      let state = req.body.state;
      this.gpio.setPin(pin, state);
      res.json({ 'status': 'success' });
    });

    router.post('/api/gpiotoggle', (req: Request, res: Response, next: NextFunction) => {
      let status = 'success';
      let message: string;
      let pin = req.body.pin;
      let pins = this.gpio.setPin(pin, true);
      setTimeout(() => {
        this.gpio.setPin(pin, false);
        res.json({ 'status': 'success' });
      }, 500);
    });

    // use router middleware
    this.app.use(router);
  }

  /**
   * Configure application
   *
   * @class Server
   * @method config
   */
  public config() {
    // add static paths
    this.app.use(express.static(path.join(__dirname, 'public')));

    // configure pug
    this.app.set('views', path.join(__dirname, 'views'));
    this.app.set('view engine', 'pug');

    // use json form parser middlware
    this.app.use(bodyParser.json());

    // use query string parser middlware
    this.app.use(bodyParser.urlencoded({
      extended: true
    }));

    // use override middlware
    this.app.use(methodOverride());

    // catch 404 and forward to error handler
    this.app.use(function (err: any, req: express.Request, res: express.Response, next: express.NextFunction) {
      err.status = 404;
      next(err);
    });

    // error handling
    this.app.use(errorHandler());
  }

  /**
   * Create router
   *
   * @class Server
   * @method api
   */
  public routes() {
    let router: express.Router;
    router = express.Router();

    // IndexRoute
    IndexRoute.create(router);

    // use router middleware
    this.app.use(router);
  }
}
