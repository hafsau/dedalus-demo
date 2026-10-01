// Shared between the simulator and the app's client, kept free of MSW
// imports so the client can check for it without pulling MSW into the
// initial bundle.

/** Every simulator response carries this header. Its absence means a request
 * reached the real network instead (e.g. the browser restarted an idle worker). */
export const SIM_HEADER = "x-workshop-sim";
