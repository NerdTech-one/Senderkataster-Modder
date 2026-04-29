const protokolleA1 = ['GSM', 'LTE, 5G', 'LTE', 'GSM, LTE, 5G'];
const protokolleTmobile = ['2G', '2G, 4G', '4G', '2G, 4G, 5G'];
const protokolleDrei = ['5G, GSM, LTE'];

const labelA1 = "A1 Telekom Austria AG";
const labelTmobile = "T-Mobile Austria GmbH";
const labelDrei = "Hutchison Drei Austria GmbH";
const labelA1oderDrei = "Hutchison Drei Austria GmbH oder A1 Telekom Austria AG";

const colorA1 = '#cbcbcb';
const colorA1oderDrei = '#e4b3e5';
const colorTMobile = '#b6cb92';
const colorDrei = '#98bcee';

// ------------------------------------------------------------------
// INTERACTION TRACKER

// Tracks if the user's last click was directly on the map canvas itself, or on an outer UI element (like a search bar or a menu). 
// This state is later used to decide whether to suppress automatic zooming.
let lastInteractionWasMap = false;

// Listen to all pointerdown events globally, capturing them early.
window.addEventListener('pointerdown', (e) => {
  // .ol-viewport is the standard CSS class for the container OpenLayers uses for its map canvas.
  // If the click originated from inside this container, the flag is set that the user interacted with the map.
  if (e.target && e.target.closest) {
    lastInteractionWasMap = e.target.closest('.ol-viewport') !== null;
  }
}, { capture: true, passive: true });

// This self-executing function intercepts OpenLayers methods within the JavaScript engine to override the map's native zooming behaviors and limits.
(function() {
  // Patching function that modifies the OpenLayers 'View' object.
  function patchViewPrototype(obj) {
    // Only patch if it's an object, has the 'animate' function, and hasn't been patched yet.
    if (obj && typeof obj === 'object' && typeof obj.animate === 'function' && !obj._isAnimatePatched) {
      // Preserve the original animate() function so we can call it later.
      const origAnimate = obj.animate;
      obj.animate = function(...args) {
        // Iterate through all animation command objects passed to animate().
        // The OpenLayers API can be called with several steps; we target the ones with zoom instructions.
        for (let i = 0; i < args.length; i++) {
          let arg = args[i];
          if (arg && typeof arg === 'object' && arg.zoom === 15) {
            // If the user clicked directly on the map canvas, suppress the automatic jump to zoom level 15.
            // This avoids the map re-centering/zooming after selecting a marker inside the popup.
            if (lastInteractionWasMap) {
              try {
                delete arg.zoom;
              } catch (e) {
                // If the object is frozen or cannot be mutated, preserve the current zoom level instead.
                if (typeof this.getZoom === 'function') {
                  arg.zoom = this.getZoom();
                }
              }
            }
          }
        }
        // Execute the original animation with the possibly adjusted arguments.
        return origAnimate.apply(this, args);
      };

      obj._isAnimatePatched = true;
      console.log("Senderkataster Modder: OpenLayers View prototype patched!");
    }
  }

  // Intercept Object.assign to detect OpenLayers configuration objects created via object literals.
  // This lets us modify map settings before the view is fully initialized without mutating source objects.
  const originalAssign = Object.assign;
  Object.assign = function(target, ...sources) {
    const patchedSources = sources.map(source => {
      if (source && source.maxZoom !== undefined && source.maxZoom === 15) {
        try {
          // Clone the source object before modifying it to avoid mutating frozen or shared data.
          const cloned = Object.assign({}, source);
          cloned.maxZoom = 22;
          return cloned;
        } catch (e) {
          return source;
        }
      }
      return source;
    });

    patchViewPrototype(target);
    return originalAssign(target, ...patchedSources);
  };

  // Intercept function binding so we can inspect contexts passed to bound functions.
  // Only patch objects that appear to be OpenLayers views; avoid touching unrelated bind calls.
  const originalBind = Function.prototype.bind;
  Function.prototype.bind = function(context, ...args) {
    if (context && typeof context === 'object' && typeof context.animate === 'function') {
      patchViewPrototype(context);
    }
    return originalBind.call(this, context, ...args);
  };
})();
// ------------------------------------------------------------------
// CSS INJECTIONS & UI TWEAKS
// Injects custom CSS into the document early to hide annoying teasers instantly and to fix UI default sizing issues inside the dynamically rendered Angular map popups.
const style = document.createElement('style');
style.textContent = `  
  /* Force override min-height on the OpenLayers popups to a more sensible value. */
  .ol-popup.visible {
    min-height: 169px !important;
    padding: 0px !important;
  }

  /* Adjust scrollable areas inside the popup to a more sensible value. */
  .popup-scroll-content {
    padding: 0px !important;
  }

  table {
    box-shadow: none !important;
  }

  /* Remove default padding from Angular components */
  .ol-popup-content {
    padding: 0px !important;
  }

  /* Re-add controlled padding to headers */
  .ol-popup.visible h3 {
    padding-top: 10px;
    padding-left: 10px;
  }

  /* Adjust the close button position */
  .ol-popup-closer {
    top: 10px !important;
  }

  /* Adjust the margins of the footer text */
  .footer-text {
    margin-left: 10px !important;
    margin-top: 5px !important;
    margin-bottom: 5px !important;
  }
  
  /* Remove vertical table cell padding for a more compact design. */
  table td {
    padding: 0px 10px !important;
  }

  @media screen and (max-width: 1279px) {
    .popup-scroll-content[_ngcontent-ng-c2067059690] {
      margin-bottom: 0px !important;
    }
  }

  /* Responsive height adjustments for taller monitors */
  @media (min-height: 800px) and (max-height: 999px) and (min-width: 1280px) {
    .ol-popup.visible {
      min-height: 169px !important;
      max-height: 358px !important;
      height: auto !important;
    }
      
    .popup-scroll-content {
      min-height: 189px !important;
      max-height: 296px !important;
      height: auto !important;
    }
  }

  /* Responsive height adjustments for very tall monitors */
  @media (min-height: 1000px) and (min-width: 1280px) {
    .ol-popup.visible {
      min-height: 169px !important;
      max-height: 506px !important;
      height: auto !important;
    }

    .popup-scroll-content {
      min-height: 189px !important;
      max-height: 468px !important;
      height: auto !important;
    }
  }

  @media (min-width: 450px) {
    .ol-popup.visible {
      min-width: auto !important;
      width: 450px !important;
    }
  }

  @media (min-width: 450px) and (max-width: 1279px) {
    .popup-scroll-content {
      margin-bottom: 0px !important;
    }
  }

  @media (max-width: 449px) {
    .popup-scroll-content {
      margin-bottom: 0px !important;
    }
      
    .ol-popup.visible {
      min-width: auto !important;
      width: 100% !important;
    }
  }
`;

function appendStyleToHead() {
  // Attempts to append the style element to the end of the document's head.
  // Returns true if successful, false if head is not available.
  const head = document.head || document.querySelector('head');
  if (!head) return false;
  if (head.lastElementChild !== style) {
    head.appendChild(style);
  }
  return true;
}

function styleInjection() {
  const injected = appendStyleToHead();
  if (!injected) return false;

  const head = document.head || document.querySelector('head');
  if (head && head.lastElementChild !== style) {
    head.appendChild(style);
  }

  return true;
}

// ------------------------------------------------------------------
// IMPROVED TEASER CLOSING LOGIC
// The website shows a teaser panel on the right side of the screen or a full screen overlay that can be closed by clicking an "X" button. 
// However, this button is not present in the DOM immediately and only appears after some time. 
// This function uses a MutationObserver to watch for changes in the DOM and automatically clicks the close button as soon as it appears.
// This ensures a cleaner user experience without manual intervention especially for frequent users of the website.

let teaserDismissed = false;
let teaserTimeoutExpired = false;
setTimeout(() => {
  teaserTimeoutExpired = true;
}, 10000);

function tryDismiss() {
  if (teaserDismissed || teaserTimeoutExpired) return;

  // 1. Desktop: sidebar teaser panel
  const closeTeaser = document.getElementById("close-teaser");
  if (closeTeaser) {
    closeTeaser.click();
    teaserDismissed = true;
    return;
  }

  // 2. Mobile: Angular Material dialog containing the welcome text.
  const dialogs = document.querySelectorAll(".mat-mdc-dialog-container");
  for (const dialog of dialogs) {
    if (dialog.textContent.includes("Willkommen beim Senderkataster")) {
      // Try a dedicated close button first (icon button at the top)
      const closeBtn = dialog.querySelector("[mat-dialog-close]");

      if (closeBtn) {
        closeBtn.click();
      }
      teaserDismissed = true;
      return;
    }
  }
}

// ------------------------------------------------------------------
// DOM PARSING & INJECTION LOGIC
//
// Searches the DOM table rows sequentially to find the "Sendeleistung" associated with a specific "Protokoll(e)" row.
// Because the table structure lists protocols and power on separate rows, we must iterate forward.
function getSendeleistungForRow(protokollRow) {
  let curr = protokollRow.nextElementSibling;
  while (curr) {
    // Skip over any custom rows we previously injected
    if (!curr.classList.contains('extension-row')) {
      const tds = curr.querySelectorAll('td');
      if (tds.length >= 2) {
        const label = tds[0].textContent.trim();
        if (label === 'Sendeleistung') {
          return tds[1].textContent.trim(); // Found it!
        }
        // If we hit another "Protokoll(e)" row before finding a Sendeleistung, stop looking.
        if (label === 'Protokoll(e)') break;
      }
    }
    curr = curr.nextElementSibling;
  }
  return null;
}

// Counts how many ambiguous 'GSM, LTE' rows exist with conflicting transmission powers. (120-140 W or 340-360 W).
function getAmbiguousCount(table) {
  let count = 0;
  if (!table) return count;
  
  table.querySelectorAll('tr').forEach(tr => {
    if (tr.classList.contains('extension-row')) return;
    const tds = tr.querySelectorAll('td');
    if (tds.length === 2 && tds[0].textContent.trim() === 'Protokoll(e)') {
      const prot = tds[1].textContent.trim();
      if (prot === 'GSM, LTE') {
        const sl = getSendeleistungForRow(tr);
        if (sl === '120-140 W' || sl === '340-360 W') {
          count++;
        }
      }
    }
  });
  return count;
}

// The function scans the entire popup table to determine which network operators are already present.
// This helps deduplicate and process ambiguous tower assignments.
function getExistingOperators(table) {
  const ops = new Set();
  if (!table) return ops;
  
  table.querySelectorAll('tr').forEach(tr => {
    if (tr.classList.contains('extension-row')) return;
    
    const tds = tr.querySelectorAll('td');
    if (tds.length >= 2 && tds[0].textContent.trim() === 'Protokoll(e)') {
      const prot = tds[1].textContent.trim();
      
      if (protokolleA1.includes(prot)) ops.add(labelA1);
      if (protokolleTmobile.includes(prot)) ops.add(labelTmobile);
      if (protokolleDrei.includes(prot)) ops.add(labelDrei);
      
      // Handle the 'GSM, LTE' edgecase
      if (prot === 'GSM, LTE') {
        const sl = getSendeleistungForRow(tr);
        // If power is NOT the ambiguous ranges, it belongs to A1
        if (sl && sl !== '120-140 W' && sl !== '340-360 W') {
          ops.add(labelA1);
        } else {
          // It could be either Drei or A1
          ops.add(labelA1oderDrei);
        }
      } else if (prot === 'LTE') {
        const sl = getSendeleistungForRow(tr);
        if (sl === '120-140 W') {
          ops.add(labelA1oderDrei);
        }
      }
    }
  });
  return ops;
}

// The core business logic: determines which operator operates a specific set of frequencies and assigns them a distinct color code for UI rendering.
function resolveStation(protokolle, sendeleistung, table, currentRow) {
  // Direct protocol matches
  if (protokolle === 'LTE' && sendeleistung === '120-140 W') {
    return [true, labelA1oderDrei, colorA1oderDrei];
  } else if (protokolleA1.includes(protokolle)) {
    return [true, labelA1, colorA1];
  } else if (protokolleTmobile.includes(protokolle)) {
    return [true, labelTmobile, colorTMobile];
  } else if (protokolleDrei.includes(protokolle)) {
    return [true, labelDrei, colorDrei];
  } else if (protokolle === 'GSM, LTE' || protokolle === 'LTE') {
    // Complex logic for 'GSM, LTE' which is used by multiple operators
    if ((sendeleistung !== '120-140 W' && (protokolle === 'GSM, LTE' || protokolle === 'LTE')) && (sendeleistung !== '340-360 W') && protokolle === 'GSM, LTE') {
      return [true, labelA1, colorA1];
    } else {
      // Checking what other operators are already on this tower
      const existingOps = getExistingOperators(table);
      if (existingOps.has(labelA1)) {
        return [true, labelDrei, colorDrei];
      } else if (existingOps.has(labelDrei)) {
        return [true, labelA1, colorA1];
      } else {
        // If there are multiple ambiguous rows, we try to alternate assignments
        const ambiguousRows = [];
        if (table) {
          table.querySelectorAll('tr').forEach(tr => {
              if (tr.classList.contains('extension-row')) return;
              const tds = tr.querySelectorAll('td');
              if (tds.length === 2 && tds[0].textContent.trim() === 'Protokoll(e)') {
                const prot = tds[1].textContent.trim();
                if (prot === 'GSM, LTE') {
                  const sl = getSendeleistungForRow(tr);
                  if (sl === '120-140 W' || sl === '340-360 W') {
                    ambiguousRows.push(tr);
                  }
                } else if (prot === 'LTE') {
                  const sl = getSendeleistungForRow(tr);
                  if (sl === '120-140 W') {
                    ambiguousRows.push(tr);
                  }
                }
              }
          });
        }

        if (ambiguousRows.length >= 2 && currentRow) {
          const index = ambiguousRows.indexOf(currentRow);
          // Distribute alternatingly based on DOM index
          if (index === 0) {
            return [true, labelA1, colorA1];
          } else if (index % 2 !== 0) {
            return [true, labelDrei, colorDrei];
          } else {
            return [true, labelA1, colorA1];
          }
        }

        // If there is absolutely to way to figure it out, label it as ambiguous
        return [true, labelA1oderDrei, colorA1oderDrei];
      }
    }
  }
  // Return empty state if no known protocols match
    return [false, "", ""];
}

// The main execution function is used to scan the currently visible popup, clean up old injected rows, and inject newly calculated operator assignments.
function runExtensionLogic() {
  const popupContent = document.getElementById('popup-content');
  if (!popupContent) return;

  // CLEANUP Phase
  // Remove any injected rows that are no longer valid, for example if the popup content has been refreshed
  // and previous 'Netzbetreiber (Erweiterung)' rows no longer correspond to the current table structure.
  popupContent.querySelectorAll('.extension-row').forEach(customRow => {
    const nextRow = customRow.nextElementSibling;
    const tds = nextRow.querySelectorAll('td');
    if (tds.length === 2 && tds[0].textContent.trim() !== 'Protokoll(e)') {
      customRow.remove();
      return;
    }
  });

  // INJECT Phase
  // Find each native 'Protokoll(e)' row and insert our resolved operator row directly above it.
  popupContent.querySelectorAll('tr').forEach(row => {
    if (row.classList.contains('extension-row')) return;

    const tds = row.querySelectorAll('td');
    if (tds.length !== 2) return;
    if (tds[0].textContent.trim() !== 'Protokoll(e)') return;

    const table = row.closest('table');
    const protokolle = tds[1].textContent.trim();
    const sendeleistung = getSendeleistungForRow(row);

    // Determine which operator owns this protocol/transmission power combination.
    const resolutionResult = resolveStation(protokolle, sendeleistung, table, row);

    if (resolutionResult[0]) {
      // If we already injected a row immediately above this one, do not inject again.
      if (row.previousElementSibling && row.previousElementSibling.classList.contains('extension-row')) return;

      // Create our custom row and mirror the original row's attributes so it appears natural.
      const newRow = document.createElement('tr');
      const td1 = document.createElement('td');
      const td2 = document.createElement('td');

      td1.textContent = 'Netzbetreiber (Erweiterung)';
      td2.textContent = resolutionResult[1];

      // Preserve any important row/table styling and markup from the original row.
      Array.from(row.attributes).forEach(attr => newRow.setAttribute(attr.nodeName, attr.nodeValue));
      Array.from(tds[0].attributes).forEach(attr => td1.setAttribute(attr.nodeName, attr.nodeValue));
      Array.from(tds[1].attributes).forEach(attr => td2.setAttribute(attr.nodeName, attr.nodeValue));

      newRow.classList.add('extension-row');
      newRow.style.backgroundColor = resolutionResult[2];
      newRow.appendChild(td1);
      newRow.appendChild(td2);

      // Insert the custom row directly before the associated protocol row.
      row.insertAdjacentElement('beforebegin', newRow);
    }
  });
}

// A MutationObserver is used to monitor the DOM for changes
const observer = new MutationObserver((mutations) => {
  // Temporarily disconnect the observer to avoid reacting to our own DOM changes while we process the popup.
  observer.disconnect();
  try {
    // Ensure the custom CSS is present before any popup logic runs.
    styleInjection();

    // Try to dismiss teasers as early as possible, but only until a timeout expires.
    if (!teaserDismissed && !teaserTimeoutExpired) {
      tryDismiss();
    }

    // Process each mutation entry provided by the observer.
    for (let mutation of mutations) {
      // If the mutation occurred directly inside the popup content area, update the extension rows.
      if (mutation.target && mutation.target.nodeType === Node.ELEMENT_NODE) {
        if (mutation.target.id === 'popup-content' || mutation.target.closest('#popup-content')) {
          runExtensionLogic();
          break;
        }
      }
    }
  } finally {
    // Reconnect the observer after processing so future DOM changes are tracked again.
    observer.observe(document.documentElement, { childList: true, subtree: true, characterData: true });
  }
});

function initializeObserver() {
  styleInjection();
  observer.observe(document.documentElement, { childList: true, subtree: true, characterData: true });
}

document.addEventListener('DOMContentLoaded', initializeObserver);