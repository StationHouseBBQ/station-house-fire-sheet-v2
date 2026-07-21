/**
 * Team workspace — barrel. Four tabs matching the Manus team/labor pages,
 * layered on dal.settings buckets: "team.staff", "team.punches",
 * "team.schedule", "team.sales", "team.messages".
 *
 *  - TimeClock    → clock in/out board + today's punches + daily hours
 *  - StaffSchedule→ weekly 7-day × staff shift grid + weekly hours
 *  - LaborCost    → scheduled labor cost vs editable sales + 25% target
 *  - MessageBoard → announcements + editable daily briefing banner
 */
export { TimeClock } from "./TimeClock";
export { StaffSchedule } from "./StaffSchedule";
export { LaborCost } from "./LaborCost";
export { MessageBoard } from "./MessageBoard";
