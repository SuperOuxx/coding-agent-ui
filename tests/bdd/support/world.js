import { setWorldConstructor } from '@cucumber/cucumber';

class BddWorld {
  constructor() {
    this.messages = [];
    this.queryPromise = null;
    this.threadFactory = null;
    this.clock = null;
    this.originalEnv = new Map();
    this.restoreFns = [];
    this.lastErrorMessage = null;
  }
}

setWorldConstructor(BddWorld);
