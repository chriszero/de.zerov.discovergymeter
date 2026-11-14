import Homey from "homey";

import {
  DiscovergyBasicAuth,
  DiscovergyApi,
  LastElectricityReading,
  ElectricityValueName,
  Meter,
  isAuthError,
} from "../../libdiscovergy";

/** Polling interval in seconds, if the setting is missing or invalid */
const DEFAULT_INTERVAL = 5;

/** Mapping of Homey capabilities to the values of a reading */
const CAPABILITY_VALUES: { [capability: string]: ElectricityValueName } = {
  meter_power: "energyInTotal",
  "meter_power.t1": "energyIn1",
  "meter_power.t2": "energyIn2",
  "meter_power.out": "energyOutTotal",
  measure_power: "currentPowerTotal",
  "measure_power.p1": "currentPower1",
  "measure_power.p2": "currentPower2",
  "measure_power.p3": "currentPower3",
  "measure_voltage.p1": "voltage1",
  "measure_voltage.p2": "voltage2",
  "measure_voltage.p3": "voltage3",
};

/**
 * Capabilities that are never removed, even if the meter does not provide
 * the value. They are referenced by the energy configuration of the driver.
 */
const PERMANENT_CAPABILITIES = [
  "meter_power",
  "meter_power.out",
  "measure_power",
];

/** Returns a short description of an error */
function describeError(error: any): string {
  return error?.message ?? String(error);
}

class ElectricitySmartmeterDevice extends Homey.Device {
  private deviceApi!: DiscovergyApi;
  private meterId!: string;
  private update?: NodeJS.Timeout;
  /** true while a request is running, prevents overlapping polls */
  private polling = false;
  /** true once the capabilities were matched to the fields of the meter */
  private capabilitiesSynced = false;

  /**
   * onInit is called when the device is initialized.
   */
  async onInit() {
    this.log("Device has been initialized");

    this.deviceApi = await this.createApi(
      this.getSetting("username"),
      this.getSetting("password")
    );
    this.meterId = this.getData().meterId;

    this.start();
  }

  private async createApi(
    username: string,
    password: string
  ): Promise<DiscovergyApi> {
    const auth = await new DiscovergyBasicAuth(
      username,
      password
    ).authorizeInstance();

    return new DiscovergyApi(auth);
  }

  private start(interval: number = this.getSetting("interval")) {
    if (this.update) {
      return;
    }

    let seconds = Number(interval);
    if (!Number.isFinite(seconds) || seconds < 1) {
      seconds = DEFAULT_INTERVAL;
    }

    this.update = this.homey.setInterval(() => {
      this.poll().catch((error) => this.error("poll", describeError(error)));
    }, seconds * 1000);

    // Don't wait for the first interval
    this.poll().catch((error) => this.error("poll", describeError(error)));
  }

  private stop() {
    if (this.update) {
      this.homey.clearInterval(this.update);
      this.update = undefined;
    }
  }

  /**
   * Fetches the last reading and updates the capabilities.
   * All errors are handled here: an unhandled rejection crashes the whole app.
   */
  private async poll(): Promise<void> {
    if (this.polling) {
      // the previous request is still running
      return;
    }
    this.polling = true;

    try {
      const reading = await this.deviceApi.getLastElectricityReading(
        this.meterId
      );

      await this.syncCapabilities(reading);
      await this.setCapabilityValues(reading);

      if (!this.getAvailable()) {
        await this.setAvailable();
      }
    } catch (error) {
      this.error("Could not get last reading:", describeError(error));

      if (isAuthError(error)) {
        await this.setUnavailable(
          this.homey.__("errors.invalid_credentials")
        ).catch((err) => this.error("setUnavailable", describeError(err)));
      }
    } finally {
      this.polling = false;
    }
  }

  /**
   * Matches the capabilities of the device to the values the meter provides.
   *
   * Meters differ a lot: older meters deliver values every few seconds,
   * including power and voltage per phase. Other meters (e.g. iMSys / smart
   * meter gateway) deliver only some of these values, or use other field
   * names. Devices paired with older app versions may also miss capabilities
   * (e.g. the voltage capabilities were removed by v1.0.4 and earlier).
   *
   * Unsupported capabilities are removed, missing ones are added. This is done
   * once, based on the field names of the meter and the values of the reading.
   */
  private async syncCapabilities(reading: LastElectricityReading) {
    if (this.capabilitiesSynced) {
      return;
    }

    let available: ElectricityValueName[];
    try {
      available = await this.deviceApi.getAvailableElectricityValues(
        this.meterId
      );
    } catch (error) {
      // try again on the next poll
      this.error("Could not get field names:", describeError(error));
      return;
    }

    if (available.length === 0) {
      // Implausible answer, don't remove anything
      this.log("Meter reported no known fields, capabilities not changed");
      this.capabilitiesSynced = true;
      return;
    }

    for (const [capability, valueName] of Object.entries(CAPABILITY_VALUES)) {
      const supported =
        available.includes(valueName) || reading[valueName] !== undefined;

      try {
        if (supported || PERMANENT_CAPABILITIES.includes(capability)) {
          await this.ensureCapability(capability);
        } else if (this.hasCapability(capability)) {
          this.log(
            `Meter does not provide ${valueName}, removing capability ${capability}`
          );
          await this.removeCapability(capability);
        }
      } catch (error) {
        this.error(
          `Could not update capability ${capability}:`,
          describeError(error)
        );
      }
    }

    this.capabilitiesSynced = true;
  }

  /** Adds a capability, if the device does not have it yet */
  private async ensureCapability(capability: string) {
    if (this.hasCapability(capability)) {
      return;
    }

    this.log(`Adding capability ${capability}`);
    await this.addCapability(capability);

    // Apply the title from driver.compose.json (e.g. "Voltage P1")
    const options = this.driver?.manifest?.capabilitiesOptions?.[capability];
    if (options) {
      await this.setCapabilityOptions(capability, options).catch((error) =>
        this.error(
          `Could not set options of ${capability}:`,
          describeError(error)
        )
      );
    }
  }

  private async setCapabilityValues(reading: LastElectricityReading) {
    for (const [capability, valueName] of Object.entries(CAPABILITY_VALUES)) {
      const value = reading[valueName];
      if (value === undefined) {
        // not provided by this meter
        continue;
      }

      try {
        await this.ensureCapability(capability);
        await this.setCapabilityValue(capability, value);
      } catch (error) {
        this.error(`Could not set ${capability}:`, describeError(error));
      }
    }
  }

  /**
   * onAdded is called when the user adds the device, called just after pairing.
   */
  async onAdded() {
    this.log("Device has been added");
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
    changedKeys: string[];
  }): Promise<string | void> {
    const { oldSettings, newSettings, changedKeys } = event;
    this.log("Settings changed:", changedKeys);

    const credentialsChanged =
      changedKeys.includes("username") || changedKeys.includes("password");
    const intervalChanged =
      changedKeys.includes("interval") &&
      oldSettings.interval != newSettings.interval;

    if (credentialsChanged) {
      // test new credentials
      const newApi = await this.createApi(
        newSettings.username,
        newSettings.password
      );

      let meters: Meter[];
      try {
        meters = await newApi.getMeters();
      } catch (error) {
        this.error("Error validating new credentials:", describeError(error));
        if (isAuthError(error)) {
          throw new Error(this.homey.__("errors.invalid_credentials"));
        }
        throw new Error(
          this.homey.__("errors.connection", { message: describeError(error) })
        );
      }

      if (!meters.some((meter) => meter.meterId === this.meterId)) {
        throw new Error(this.homey.__("errors.meter_not_found"));
      }

      this.deviceApi = newApi;
    }

    if (credentialsChanged || intervalChanged) {
      this.log("Restarting polling, interval", newSettings.interval);
      this.stop();
      this.start(newSettings.interval);
    }
  }

  /**
   * onRenamed is called when the user updates the device's name.
   * This method can be used this to synchronise the name to the device.
   * @param {string} name The new name
   */
  async onRenamed(name: string) {
    this.log("Device was renamed");
  }

  /**
   * onDeleted is called when the user deleted the device.
   */
  async onDeleted() {
    this.log("Device has been deleted");
    this.stop();
  }

  /**
   * onUninit is called when the device is destroyed (e.g. app restart).
   */
  async onUninit() {
    this.stop();
  }
}

module.exports = ElectricitySmartmeterDevice;
