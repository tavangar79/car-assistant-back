/** Number of Jalali months in the chart, the current one included. */
export const DASHBOARD_MONTHS = 6;

export interface VehicleCost {
  vehicleId: string;
  totalCost: number;
}

export interface DashboardVehicle {
  vehicleId: string;
  /** Due items that are `overdue` or `due_soon`. */
  attentionCount: number;
  yearTotalCost: number;
}

export interface DashboardMonth {
  jalaliYear: number;
  jalaliMonth: number;
  /** Inclusive. */
  from: Date;
  /** Exclusive: the next month's `from`. */
  to: Date;
  totalCost: number;
  /** Every vehicle (zeros included), in garage order. */
  byVehicle: VehicleCost[];
}

export interface Dashboard {
  /** The current Jalali year in Tehran. */
  jalaliYear: number;
  /** Cost of every record from the start of the Jalali year to now. */
  yearTotalCost: number;
  /** Services with an invoice plus expenses with an attachment, all time. */
  invoiceCount: number;
  attentionCount: number;
  /** In garage order. */
  vehicles: DashboardVehicle[];
  /** Oldest first, the current month last. */
  months: DashboardMonth[];
}
