import {
  Meter,
  LastReading,
  LastElectricityReading,
  ElectricityValueName,
} from "./models";
import { HttpClient, QueryParams } from "./httpClient";

/** Energy is delivered in 10^-10 kWh */
const ENERGY_SCALE = 1e10;
/** Power is delivered in mW */
const POWER_SCALE = 1000;
/** Voltage is delivered in mV */
const VOLTAGE_SCALE = 1000;

/**
 * Mapping of electricity values to the raw field names of the API.
 * Depending on the meter type, the same value is delivered under different
 * field names (e.g. "power1" vs. "phase1Power", "voltage1" vs. "phase1Voltage").
 * The first field name that is contained in a reading wins.
 */
export const ELECTRICITY_FIELDS: {
  [name in ElectricityValueName]-?: { fields: string[]; scale: number };
} = {
  energyInTotal: { fields: ["energy"], scale: ENERGY_SCALE },
  energyIn1: { fields: ["energy1"], scale: ENERGY_SCALE },
  energyIn2: { fields: ["energy2"], scale: ENERGY_SCALE },
  energyOutTotal: { fields: ["energyOut"], scale: ENERGY_SCALE },
  energyOut1: { fields: ["energyOut1"], scale: ENERGY_SCALE },
  energyOut2: { fields: ["energyOut2"], scale: ENERGY_SCALE },
  currentPowerTotal: { fields: ["power"], scale: POWER_SCALE },
  currentPower1: { fields: ["power1", "phase1Power"], scale: POWER_SCALE },
  currentPower2: { fields: ["power2", "phase2Power"], scale: POWER_SCALE },
  currentPower3: { fields: ["power3", "phase3Power"], scale: POWER_SCALE },
  voltage1: { fields: ["voltage1", "phase1Voltage"], scale: VOLTAGE_SCALE },
  voltage2: { fields: ["voltage2", "phase2Voltage"], scale: VOLTAGE_SCALE },
  voltage3: { fields: ["voltage3", "phase3Voltage"], scale: VOLTAGE_SCALE },
};

const ELECTRICITY_VALUE_NAMES = Object.keys(
  ELECTRICITY_FIELDS
) as ElectricityValueName[];

/**
 * The API allows only 1 concurrent connection per client IP, additional
 * requests are rejected with HTTP 429. All requests of the app (all devices
 * and the pairing) are therefore sent one after another.
 */
let requestQueue: Promise<unknown> = Promise.resolve();

function enqueue<T>(request: () => Promise<T>): Promise<T> {
  const result = requestQueue.then(request, request);
  requestQueue = result.catch(() => undefined);
  return result;
}

export class DiscovergyApi {
  private http: HttpClient;

  /** key: meterId, value: [fields] */
  private cachedFields = new Map<string, string[]>();

  constructor(httpClient: HttpClient) {
    this.http = httpClient;
  }

  /**Return all meters that the user has access to */
  public async getMeters(): Promise<Meter[]> {
    const data = await enqueue(() => this.http.get<Meter[]>("/meters"));

    if (!Array.isArray(data)) {
      throw new Error("Unexpected response for meters");
    }

    return data;
  }

  /**
   * Returns the field names a meter provides. The result is cached per meter,
   * as the available fields of a meter do not change.
   */
  public async getFieldNames(meter: Meter | string): Promise<string[]> {
    const meterId = typeof meter === "string" ? meter : meter.meterId;

    const cached = this.cachedFields.get(meterId);
    if (cached) {
      return cached;
    }

    const data = await enqueue(() =>
      this.http.get<string[]>("/field_names", { meterId: meterId })
    );

    if (!Array.isArray(data)) {
      throw new Error("Unexpected response for field_names");
    }

    this.cachedFields.set(meterId, data);
    return data;
  }

  /**
   * Returns the last reading of a meter.
   * @param fields fields to request; if omitted, all fields of the meter are returned
   */
  public async getLastReading(
    meter: Meter | string,
    fields?: string[]
  ): Promise<LastReading> {
    const meterId = typeof meter === "string" ? meter : meter.meterId;

    const params: QueryParams = {
      meterId: meterId,
      each: false,
    };
    if (fields && fields.length > 0) {
      // the API expects a comma separated list
      params.fields = fields.join(",");
    }

    const data = await enqueue(() =>
      this.http.get<LastReading>("/last_reading", params)
    );

    if (!data || typeof data.values !== "object" || data.values === null) {
      throw new Error("Unexpected response for last_reading");
    }

    return data;
  }

  /**
   * Returns which electricity values a meter provides, based on its field names.
   */
  public async getAvailableElectricityValues(
    meter: Meter | string
  ): Promise<ElectricityValueName[]> {
    const fieldNames = await this.getFieldNames(meter);

    return ELECTRICITY_VALUE_NAMES.filter((name) =>
      ELECTRICITY_FIELDS[name].fields.some((field) =>
        fieldNames.includes(field)
      )
    );
  }

  public async getLastElectricityReading(
    meter: Meter | string
  ): Promise<LastElectricityReading> {
    const lastReading = await this.getLastReading(meter);
    const values = lastReading.values;

    const lastElectricityReading: LastElectricityReading = {
      time: lastReading.time,
      voltageAvailable: false,
    };

    for (const name of ELECTRICITY_VALUE_NAMES) {
      const { fields, scale } = ELECTRICITY_FIELDS[name];
      for (const field of fields) {
        const raw = values[field];
        if (typeof raw === "number" && Number.isFinite(raw)) {
          lastElectricityReading[name] = raw / scale;
          break;
        }
      }
    }

    lastElectricityReading.voltageAvailable =
      lastElectricityReading.voltage1 !== undefined ||
      lastElectricityReading.voltage2 !== undefined ||
      lastElectricityReading.voltage3 !== undefined;

    return lastElectricityReading;
  }

  // public async getLastGasReading(meter: Meter | string): Promise<LastGasReading> {

  // }
}
