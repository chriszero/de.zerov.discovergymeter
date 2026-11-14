import Homey from "homey";
import {
  DiscovergyBasicAuth,
  DiscovergyApi,
  isAuthError,
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
      const api = new DiscovergyApi(await da.authorizeInstance());

      let credentialsAreValid = false;
      try {
        await api.getMeters();
        credentialsAreValid = true;
      } catch (error: any) {
        if (!isAuthError(error)) {
          // network problem, rate limit, ... -> show the error to the user
          this.error("Login failed:", error?.message);
          throw new Error(
            this.homey.__("errors.connection", { message: error?.message })
          );
        }
        this.log("Credentials are not valid");
      }

      // return true to continue adding the device if the login succeeded
      // return false to indicate to the user the login attempt failed
      // thrown errors will also be shown to the user
      return credentialsAreValid;
    });

    session.setHandler("list_devices", async () => {
      const da = new DiscovergyBasicAuth(username, password);
      const api = new DiscovergyApi(await da.authorizeInstance());
      const meters = await api.getMeters();

      const devices: any[] = [];

      meters.forEach((meter) => {
        if (meter.measurementType === "ELECTRICITY") {
          devices.push({
            name: meter.printedFullSerialNumber,
            data: {
              id: meter.meterId,
              meterId: meter.meterId,
            },
            settings: {
              username: username,
              password: password,
            },
          });
        }
      });

      return devices;
    });
  }
}

module.exports = ElectricitySmartmeterDriver;
