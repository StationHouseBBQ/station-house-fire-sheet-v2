/**
 * Inventory workspace — public barrel.
 * On-hand board, physical counts, receiving, purchase orders, and vendors.
 * Data is persisted through dal.settings under the "inventory.*" keys.
 */
export { InventoryBoard } from "./InventoryBoard";
export { InventoryCount } from "./InventoryCount";
export { ReceiveShipment } from "./ReceiveShipment";
export { PurchaseOrders } from "./PurchaseOrders";
export { Vendors } from "./Vendors";
