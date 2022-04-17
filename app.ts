import Homey from 'homey';
// Start debuger

// if (process.env.DEBUG === "1") {
//   require("inspector").open(9229, "0.0.0.0", false);
//   require("inspector").open(9229, "0.0.0.0", true);
//   }

class DiscoverySmartmeterApp extends Homey.App {

  /**
   * onInit is called when the app is initialized.
   */
  async onInit() {
    this.log('DiscoverySmartmeterApp has been initialized');
  }

}

module.exports = DiscoverySmartmeterApp;
