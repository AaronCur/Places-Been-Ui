// Placement and sizes of the Add city dialog, shared with the dashboard. A separate file on purpose:
// importing them from the dialog's own file would pull the whole lazy dialog into the initial bundle.

/** centered: phone (full screen) · docked: desktop, bottom right above the floating button */
export type DialogPlacement = 'centered' | 'docked';

export const DOCKED_DIALOG_WIDTH = 440;
export const DOCKED_DIALOG_MARGIN = 24;
/** How much of the globe's right edge the docked dialog covers, so the globe can centre in the rest */
export const DOCKED_DIALOG_INSET = DOCKED_DIALOG_WIDTH + DOCKED_DIALOG_MARGIN * 2;
/** Same breakpoint as the dashboard CSS: side-by-side layout and the docked dialog from here up */
export const DESKTOP_QUERY = '(min-width: 840px)';
