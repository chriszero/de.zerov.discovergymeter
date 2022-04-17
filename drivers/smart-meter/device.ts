import Homey from "homey";

import {
  DiscovergyBasicAuth,
  DiscovergyApi,
  LastElectricityReading,
} from "../../libdiscovergy";

class ElectricitySmartmeterDevice extends Homey.Device {
  private deviceApi!: DiscovergyApi;
  private meterId!: string;
  private update?: NodeJS.Timeout;

  /**
   * onInit is called when the device is initialized.
   */
  async onInit() {
    this.log("MyDevice has been initialized");

    const auth = await new DiscovergyBasicAuth(
      this.getSetting("username"),
      this.getSetting("password")
    ).authorizeInstance();

    this.deviceApi = new DiscovergyApi(auth);
    this.meterId = this.getData().meterId;

    try {
      const reading = await this.deviceApi.getLastElectricityReading(
        this.meterId
      );
      // remove capabilities which are not availiable
      if (!reading.voltageAvaliabe) {
        this.removeCapability("measure_voltage.p1").catch();
        this.removeCapability("measure_voltage.p2").catch();
        this.removeCapability("measure_voltage.p3").catch();
      }
    } catch (error) {
      this.log(error);
    }
    this.start();
  }

  private start() {
    if (!this.update) {
      this.update = this.homey.setInterval(
        this.setCapabilityValues.bind(this),
        5000
      );
    }
  }

  private stop() {
    if (this.update) {
      this.homey.clearTimeout(this.update);
      this.update = undefined;
    }
  }

  async setCapabilityValues() {
    const reading = await this.deviceApi.getLastElectricityReading(
      this.meterId
    );

    this.setCapabilityValue("meter_power", reading.energyInTotal);
    this.setCapabilityValue("meter_power.t1", reading.energyIn1);
    this.setCapabilityValue("meter_power.t2", reading.energyIn2);

    this.setCapabilityValue("meter_power.out", reading.energyOutTotal);

    this.setCapabilityValue("measure_power", reading.currentPowerTotal);
    this.setCapabilityValue("measure_power.p1", reading.currentPower1);
    this.setCapabilityValue("measure_power.p2", reading.currentPower2);
    this.setCapabilityValue("measure_power.p3", reading.currentPower3);

    if (reading.voltageAvaliabe) {
      this.setCapabilityValue("measure_voltage.p1", reading.voltage1);
      this.setCapabilityValue("measure_voltage.p2", reading.voltage2);
      this.setCapabilityValue("measure_voltage.p3", reading.voltage3);
    }
  }

  /**
   * onAdded is called when the user adds the device, called just after pairing.
   */
  async onAdded() {
    this.log("MyDevice has been added");
  }

  /**
   * onSettings is called when the user updates the device's settings.
   * @param {object} event the onSettings event data
   * @param {object} event.oldSettings The old settings object
   * @param {object} event.newSettings The new settings object
   * @param {string[]} event.changedKeys An array of keys changed since the previous version
   * @returns {Promise<string|void>} return a custom message that will be displayed
   */
  async onSettings(event: {
    oldSettings: any;
    newSettings: any;
    changedKeys: [string];
  }): Promise<string | void> {
    this.log("MyDevice settings where changed");
    this.log(event.changedKeys);
    this.log(event.newSettings);
    this.log(event.newSettings.username);

    if (
      event.changedKeys.includes("username") ||
      event.changedKeys.includes("password")
    ) {
      //test new creditials
      const auth = await new DiscovergyBasicAuth(
        event.newSettings.username,
        event.newSettings.password
      ).authorizeInstance();

      const newApi = new DiscovergyApi(auth);
      let credentialsAreValid = false;
      try {
        const meters = newApi.getMeters();
      } catch (error) {
        credentialsAreValid = false;
      }
      if (!credentialsAreValid) {
        throw new Error("Creditials are not valid");
      }
      this.stop();
      this.deviceApi = newApi;
      this.start();
    }
  }

  /**
   * onRenamed is called when the user updates the device's name.
   * This method can be used this to synchronise the name to the device.
   * @param {string} name The new name
   */
  async onRenamed(name: string) {
    this.log("MyDevice was renamed");
  }

  /**
   * onDeleted is called when the user deleted the device.
   */
  async onDeleted() {
    this.log("MyDevice has been deleted");
    this.stop();
  }
}

module.exports = ElectricitySmartmeterDevice;
