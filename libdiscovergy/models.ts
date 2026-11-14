export interface Meter {
    /**Unique meterId, used as an identifier */
    meterId:                 string;
    /**DLMS manufacturerId */
    manufacturerId:          string;
    /**Short serial number of the meter. */
    serialNumber:            string;
    /**Full standardized serial number, as it is reported by the meter itself. */
    fullSerialNumber:        string;
    /**Full standardized serial number, as it is printed on the meter. Note: This might differ from fullSerialNumber only on meters from the manufacturer EMH. */
    printedFullSerialNumber: string;
    /**Physical location of the meter */
    location:                Location;
    /**Metering location number (MeLo or Zaehlpunktnummer) associated with the meter */
    administrationNumber:    string;
    /**Device type of the meter */
    type:                    string;
    /**Physical quantity being measured by the meter */
    measurementType:         string;
    /**Metering load profile type associated with the meter */
    loadProfileType:         string;
    /**Factor imposed on metered current AND voltage by a transducer */
    scalingFactor:           number;
    /**Factor imposed on metered current by a transducer */
    currentScalingFactor:    number;
    /**Factor imposed on metered voltage by a transducer */
    voltageScalingFactor:    number;
    /**Number of individual metering units comprising the meter */
    internalMeters:          number;
    /**Time of the first measurement sent by the meter, as a UNIX millisecond timestamp, or -1 if the meter has not sent any measurements */
    firstMeasurementTime:    number;
    /**Time of the last measurement sent by the meter, as a UNIX millisecond timestamp, or -1 if the meter has not sent any measurements */
    lastMeasurementTime:     number;
}

export interface Location {
    /**Name of the street where the meter is located */
    street:       string;
    /**Number in the street where the meter is located */
    streetNumber: string;
    /**Postal code where the meter is located */
    zip:          string;
    /**City/town where the meter is located */
    city:         string;
    /**Country code where the meter is located */
    country:      string;
}

export interface LastReading {
    /**Time of the measurement, as a UNIX millisecond timestamp */
    time:   number;
    /** use fieldnames from getFieldNames as key
     *  values are raw measurments
    */
    values: { [key: string]: number };
}


/**
 * Values of an electricity meter, already converted to Homey units.
 * A value is undefined if the meter does not provide it (e.g. meters
 * without per-phase values, without tariffs or without voltage, like
 * many iMSys / smart meter gateway meters).
 */
export interface ElectricityValues {
    /**kWh */
    energyInTotal?: number;
    /**kWh (HT) */
    energyIn1?: number;
    /**kWh (NT) */
    energyIn2?: number;

    /**kWh */
    energyOutTotal?: number;
    /**kWh (HT) */
    energyOut1?: number;
    /**kWh (NT)*/
    energyOut2?: number;

    /**Watts */
    currentPowerTotal?: number;
    /**Watts */
    currentPower1?: number;
    /**Watts */
    currentPower2?: number;
    /**Watts */
    currentPower3?: number;

    /**Volts */
    voltage1?: number;
    /**Volts */
    voltage2?: number;
    /**Volts */
    voltage3?: number;
}

export type ElectricityValueName = keyof ElectricityValues;

export interface LastElectricityReading extends ElectricityValues {
    /**Time of the measurement, as a UNIX millisecond timestamp */
    time: number;
    /**true if at least one voltage value is contained in the reading */
    voltageAvailable: boolean;
}
