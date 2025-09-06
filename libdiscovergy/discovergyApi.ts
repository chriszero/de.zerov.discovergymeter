import { Meter, LastReading, LastElectricityReading } from "./models";
import { AxiosInstance } from "axios";

export class DiscovergyApi {
  private axios: AxiosInstance;

  /** key: meterId, value: [fields] */
  private cachedFields = new Map<string, [string]>();

  constructor(axiosInstance: AxiosInstance) {
    this.axios = axiosInstance;
  }

  /**Return all meters that the user has access to */
  public async getMeters(): Promise<[Meter]> {
    let { data } = await this.axios.get("/meters");

    return data;
  }

  /**
   * getFieldNames
   */
  public async getFieldNames(meter: Meter | string): Promise<[string]> {
    const meterId = typeof meter === "string" ? meter : meter.meterId;

    let { data } = await this.axios.get("/field_names", {
      params: {
        meterId: meterId,
      },
    }).catch();

    return data;
  }

  public async getLastReading(
    meter: Meter | string,
    fields?: [string]
  ): Promise<LastReading> {
    const meterId = typeof meter === "string" ? meter : meter.meterId;
    
    if (fields == undefined) {
      // check if we have cached fields for meterId
      if(this.cachedFields.has('meterId')) {
        fields = this.cachedFields.get('meterId')
      }
      else {
        fields = await this.getFieldNames(meter);
        this.cachedFields.set(meterId, fields);
      }
    }
    let { data } = await this.axios.get("/last_reading", {
      params: {
        meterId: meterId,
        each: false,
        fields: fields,
      },
    });

    return data;
  }

  public async getLastElectricityReading(
    meter: Meter | string
  ): Promise<LastElectricityReading> {
    const kwhFactor = 10e9; // 1.000.000.000
    const meterId = typeof meter === "string" ? meter : meter.meterId;
    const lastReading = await this.getLastReading(meterId);

    const lastElectricityReading: LastElectricityReading = {
      time: lastReading.time,
      energyInTotal: lastReading.values["energy"] / kwhFactor,
      energyIn1: lastReading.values["energy1"] / kwhFactor,
      energyIn2: lastReading.values["energy2"] / kwhFactor,
      energyOutTotal: lastReading.values["energyOut"] / kwhFactor,
      energyOut1: lastReading.values["energyOut1"] / kwhFactor,
      energyOut2: lastReading.values["energyOut2"] / kwhFactor,
      currentPowerTotal: lastReading.values["power"] / 1000,
      currentPower1: lastReading.values["power1"] / 1000,
      currentPower2: lastReading.values["power2"] / 1000,
      currentPower3: lastReading.values["power3"] / 1000,

      voltageAvailable: false
    };

    if(lastReading.values['voltage1']){
      lastElectricityReading.voltageAvailable = true;
      lastElectricityReading.voltage1 = lastReading.values['voltage1'] / 1000;
      lastElectricityReading.voltage2 = lastReading.values['voltage2'] / 1000;
      lastElectricityReading.voltage3 = lastReading.values['voltage3'] / 1000;
    }

    return lastElectricityReading;
  }

  // public async getLastGasReading(meter: Meter | string): Promise<LastGasReading> {
  
  // }
}
