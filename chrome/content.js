const protokolleA1 = ['LTE, 5G', 'GSM, LTE, 5G'];
const protokolleTmobile = ['2G, 4G', '4G', '2G, 4G, 5G'];
const protokolleDrei = ['5G, GSM, LTE'];

const labelA1 = "A1 Telekom Austria AG";
const labelTmobile = "T-Mobile Austria GmbH";
const labelDrei = "Hutchison Drei Austria GmbH";
const labelA1oderDrei = "Hutchison Drei Austria GmbH oder A1 Telekom Austria AG";

const colorA1 = '#ffc1c1';
const colorA1oderDrei = '#e6f2ff';
const colorTMobile = '#fce4ec';
const colorDrei = '#fff3e0';

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
      
      // Control of the animate() function
      const origAnimate = obj.animate;
      obj.animate = function(...args) {
        // Loop through all arguments passed to the animate function
        for (let i = 0; i < args.length; i++) {
          let arg = args[i];
          // If the map is trying to animate to exactly zoom level 15...
          if (arg && typeof arg === 'object' && arg.zoom === 15) {
            // If the user clicked a marker on the map, the zoom instruction will be deleted to prevent the map from annoyingly zooming out/in automatically.
            // However, if they clicked a UI element (like searching an address), the default zoom behavior is allowed to happen.
            if (lastInteractionWasMap) {
              try {
                delete arg.zoom;
              } catch (e) {
                // Fallback in case the property can't be deleted: animate to the current zoom level.
                if (typeof this.getZoom === 'function') {
                  arg.zoom = this.getZoom();
                }
              }
            }
          }
        }
        // Call the original OpenLayers animate function with our modified arguments
        return origAnimate.apply(this, args);
      };
      
      obj._isAnimatePatched = true;
      console.log("Senderkataster Modder: OpenLayers View prototype patched!");
    }
  }

  // Intercept Object.assign to catch inline configurations
  const originalAssign = Object.assign;
  Object.assign = function(target, ...sources) {
    sources.forEach(source => {
      if (source) {
        // If configuration objects enforce a maxZoom of 15, overwrite it to 22
        if (source.maxZoom !== undefined && source.maxZoom === 15) {
          source.maxZoom = 22;
        }
      }
    });
    patchViewPrototype(target);
    return originalAssign(target, ...sources);
  };

  // Intercept function binding to patch the view context
  const originalBind = Function.prototype.bind;
  Function.prototype.bind = function(context, ...args) {
    patchViewPrototype(context);
    return originalBind.call(this, context, ...args);
  };
})();
// ------------------------------------------------------------------
// CSS INJECTIONS & UI TWEAKS
// Injects custom CSS into the document early to hide annoying teasers instantly and to fix UI default sizing issues inside the dynamically rendered Angular map popups.
const style = document.createElement('style');
style.textContent = `
  /* Hide unnecessary teasers to declutter the UI */
  #teaser-container {
    display: none !important;
  }
  
  /* Force override min-height on the OpenLayers popups to a more sensible value. */
  .ol-popup.visible {
    min-height: 169px !important;
    padding: 0px !important;
  }

  /* Adjust scrollable areas inside the popup to a more sensible value. */
  .popup-scroll-content {
    padding: 0px !important;
  }

  /* Remove default padding from Angular components */
  .ol-popup-content.ng-star-inserted {
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

  /* Hide useless footer text */
  .footer-text.ng-star-inserted {
    display: none
  }
  
  /* Remove vertical table cell padding for a more compact design. */
  table td {
    padding: 0px 10px !important;
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
      max-height: 320px !important;
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
// Appended safely to documentElement so it applies immediately, even before the <head> or <body> tags fully parse.
document.documentElement.appendChild(style);
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
      }
    }
  });
  return ops;
}

// The core business logic: determines which operator operates a specific set of frequencies and assigns them a distinct color code for UI rendering.
function resolveStation(protokolle, sendeleistung, table, currentRow) {
  // Direct protocol matches
  if (protokolleA1.includes(protokolle)) {
    return [true, labelA1, colorA1];
  } else if (protokolleTmobile.includes(protokolle)) {
    return [true, labelTmobile, colorTMobile];
  } else if (protokolleDrei.includes(protokolle)) {
    return [true, labelDrei, colorDrei];
  } else if (protokolle === 'GSM, LTE') {
    // Complex logic for 'GSM, LTE' which is used by multiple operators
    if (sendeleistung !== '120-140 W' && sendeleistung !== '340-360 W') {
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
  // Removes previously injected '.extension-row' elements if the underlying data they relied on has changed or vanished (to prevent stale data).
  popupContent.querySelectorAll('.extension-row').forEach(customRow => {
    const nextRow = customRow.nextElementSibling;
    const tds = nextRow.querySelectorAll('td');
    if (tds.length === 2 && tds[0].textContent.trim() !== 'Protokoll(e)') {
      customRow.remove();
      return;
    }
  });

  // INJECT Phase
  // Loop through all native table rows to find "Protokoll(e)" entries.
  popupContent.querySelectorAll('tr').forEach(row => {
    if (row.classList.contains('extension-row')) return;

    const tds = row.querySelectorAll('td');
    if (tds.length !== 2) return;
    if (tds[0].textContent.trim() !== 'Protokoll(e)') return;

    const table = row.closest('table');
    const protokolle = tds[1].textContent.trim();
    const sendeleistung = getSendeleistungForRow(row);

    // Determine which operator owns this protocol/transmission power combination
    const resolutionResult = resolveStation(protokolle, sendeleistung, table, row);

    if (resolutionResult[0]) {
      // Prevent double injection if a custom row already exists immediately prior
      if (row.previousElementSibling && row.previousElementSibling.classList.contains('extension-row')) return;

      // Create our custom row displaying the resolved operator name
      const newRow = document.createElement('tr');
      const td1 = document.createElement('td');
      const td2 = document.createElement('td');

      td1.textContent = 'Netzbetreiber (Erweiterung)';
      td2.textContent = resolutionResult[1];

      // Copy styling/attributes from the original row to make our custom row blend in natively
      Array.from(row.attributes).forEach(attr => newRow.setAttribute(attr.nodeName, attr.nodeValue));
      Array.from(tds[0].attributes).forEach(attr => td1.setAttribute(attr.nodeName, attr.nodeValue));
      Array.from(tds[1].attributes).forEach(attr => td2.setAttribute(attr.nodeName, attr.nodeValue));

      newRow.classList.add('extension-row');
      newRow.style.backgroundColor = resolutionResult[2];
      newRow.appendChild(td1);
      newRow.appendChild(td2);

      // Insert our new custom row right before the "Protokoll(e)" row
      row.insertAdjacentElement('beforebegin', newRow);
    }
  });
}

// A MutationObserver is used to monitor the DOM for changes, because the map popups are dynamically generated and destroyed by Angular.
const observer = new MutationObserver((mutations) => {
  // Briefly disconnect the observer to prevent infinite loops when we modify the DOM ourselves
  observer.disconnect();
  try {
    for (let mutation of mutations) {
      // If elements are added/changed, specifically the map's popup-content
      if (mutation.target && mutation.target.nodeType === Node.ELEMENT_NODE) {
        if (mutation.target.id === 'popup-content' || mutation.target.closest('#popup-content')) {
          runExtensionLogic();
          break; 
        }
      }
    }
  } finally {
    // Re-attach the observer once we are done making changes
    initializeObserver();
  }
});

function initializeObserver() {
  const mapContainer = document.getElementById('map-container') || document.body;
  if (mapContainer) observer.observe(mapContainer, { childList: true, subtree: true, characterData: true });
}

document.addEventListener('DOMContentLoaded', initializeObserver);