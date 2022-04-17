import Homey from "homey";
import {
  DiscovergyBasicAuth,
  DiscovergyApi,
} from "../../libdiscovergy";

class ElectricitySmartmeterDriver extends Homey.Driver {

  /**
   * onInit is called when the driver is initialized.
   */
  async onInit() {
    this.log("MyDriver has been initialized");
  }

  async onPair(session: import("homey/lib/PairSession")): Promise<void> {
    let username = "";
    let password = "";

    session.setHandler("login", async (data) => {
      username = data.username;
      password = data.password;
      
      const da = new DiscovergyBasicAuth(username, password);
      
      const oAuthClient = await da.authorizeInstance();

      let credentialsAreValid = false;
      try {
        const response = await oAuthClient.get("/meters");
        credentialsAreValid = response.status == 200;
      }
      catch(error) {
        credentialsAreValid = false;
        this.log("Creditials are not valid")
      }

      // return true to continue adding the device if the login succeeded
      // return false to indicate to the user the login attempt failed
      // thrown errors will also be shown to the user
      return credentialsAreValid;
    });

    session.setHandler("list_devices", async () => {
      const da = new DiscovergyBasicAuth(username, password);
      const oAuthClient = await da.authorizeInstance();

      const api = new DiscovergyApi(oAuthClient);
      const meters = await api.getMeters();

      const devices = Array();

      meters.forEach((meter) => {
        devices.push({
          name: meter.fullSerialNumber,
          data: {
            id: meter.meterId,
            meterId: meter.meterId,
          },
          settings :{
            username: username,
            password: password
          }
        });
      });

      return devices;
    });
  }
}

module.exports = ElectricitySmartmeterDriver;
