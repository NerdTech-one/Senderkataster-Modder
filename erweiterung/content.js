const protokolleA1 = ['GSM', 'LTE, 5G', 'LTE', 'GSM, LTE, 5G'];
const protokolleTmobile = ['2G', '2G, 4G', '4G', '2G, 4G, 5G'];
const protokolleDrei = ['5G, GSM, LTE'];

const labelA1 = "A1 Telekom Austria AG";
const labelTmobile = "T-Mobile Austria GmbH";
const labelDrei = "Hutchison Drei Austria GmbH";

const colorA1 = '#cbcbcb';
const colorTMobile = '#b6cb92';
const colorDrei = '#98bcee';

// ------------------------------------------------------------------
// INTERCEPT GETDETAILS.PHP RESPONSES

// Stores the most recently extracted leistung values
let latestLeistungen = [];

(function() {
  // Keep a reference to the original XMLHttpRequest.open method
  const originalOpen = XMLHttpRequest.prototype.open;

  // Override XMLHttpRequest.open to capture the request URL
  XMLHttpRequest.prototype.open = function(method, url, ...args) {
    // Save the requested URL on the xhr instance for later use in send/onload
    this._url = url;

    // Call the original open method with the original arguments
    return originalOpen.apply(this, [method, url, ...args]);
  };

  // Keep a reference to the original XMLHttpRequest.send method
  const originalSend = XMLHttpRequest.prototype.send;

  // Override XMLHttpRequest.send to hook into the response lifecycle
  XMLHttpRequest.prototype.send = function(...args) {
    const xhr = this;

    // Preserve any existing onload handler to not break original behavior
    const originalOnLoad = this.onload;

    // Replace onload with the custom handler
    this.onload = function() {
      // Only process responses from requests whose URL contains getdetails.php
      if (xhr._url && xhr._url.includes('getdetails.php')) {
        // Log the raw response for debugging
        console.log('Response from getdetails.php:', xhr.responseText);

        try {
          // Parse the response as JSON
          const response = JSON.parse(xhr.responseText);

          // Check that response.data exists and is an array
          if (response.data && Array.isArray(response.data) && 'leistung' in response.data[0]) {
            // Extract the leistung value from each item, format it to 2 decimal places, convert dot decimal separator to comma, and store the result in latestLeistungen
            latestLeistungen = response.data.map(item =>
              String(item.leistung.toFixed(2)).replace('.', ',')
            );
          }
        } catch (e) {
          // Log parsing errors if the response is not valid JSON
          console.error('Failed to parse getdetails.php response:', e);
        }
      }

      // Call the original onload handler, if one was defined
      if (originalOnLoad) {
        originalOnLoad.apply(this, arguments);
      }
    };

    // Call the original send method with the original arguments
    return originalSend.apply(this, args);
  };
})();

// ------------------------------------------------------------------
// INTERACTION TRACKER
// Remembers whether the most recent pointer interaction started inside the actual OpenLayers map viewport.
// Some later logic suppresses an automatic zoom-to-15 behavior, but only when the user was clearly interacting with the map itself. 
// If they clicked some outer UI control, this should not be treated as a direct map interaction.
let lastInteractionWasMap = false;

// Listen globally to detect the interaction before application code or library handlers potentially stop propagation or transform the event.
// capture: true  -> run during the capture phase, as early as possible.
// passive: true  -> this listener never calls preventDefault(), so passive is safe.
window.addEventListener('pointerdown', (e) => {
  // Guard against unusual event targets and make sure closest() exists before using it. In normal browser DOM events this is usually available, but this check avoids runtime errors in edge cases.
  if (e.target && e.target.closest) {
    // OpenLayers renders the interactive map area inside an element with the .ol-viewport class. 
    // If the pointerdown happened anywhere inside that container, treat the interaction as a map-originated action.
    // closest('.ol-viewport') returns the nearest matching ancestor or null.
    lastInteractionWasMap = e.target.closest('.ol-viewport') !== null;
  }
}, { capture: true, passive: true });


// This Immediately Invoked Function Expression wraps all patching logic to not leak helper functions or temporary references into the global scope.
// The overall goal is to detect OpenLayers View-like objects, patch their animate() behavior, relax the maxZoom constraint from 15 to 22 and do all of that as early and transparently as possible
(function() {
  // Patches an OpenLayers View-like object by wrapping its animate() method.
  // Patches instances/objects defensively instead of assuming direct access to the OpenLayers source or constructor at load time.
  function patchViewPrototype(obj) {
    // Only patch once, and only if the target looks like a view object.
    if (obj && typeof obj === 'object' && typeof obj.animate === 'function' && !obj._isAnimatePatched) {
      // Keep a reference to the original animate() so the wrapper can delegate back to native/library behavior after adjusting arguments.
      const origAnimate = obj.animate;
      // Replace animate() with a wrapper that inspects animation step objects.
      obj.animate = function(...args) {
        // OpenLayers animate() can receive one or more animation definition objects. 
        // Therefore, scan all arguments because zoom instructions may appear in any of them.
        for (let i = 0; i < args.length; i++) {
          let arg = args[i];

          // Only inspect plain object-like animation steps, and only target the specific zoom level to suppress/override.
          // This code intentionally only reacts to zoom === 15 and does not alter other zoom animations.
          if (arg && typeof arg === 'object' && arg.zoom === 15) {
            // Suppress the forced jump to zoom 15 only when the latest interaction really came from the map viewport.
            // This prevents auto-zoom side effects such as sudden recentering or unwanted zoom jumps after the user interacts with map content.
            if (lastInteractionWasMap) {
              try {
                // Best case: remove the zoom instruction entirely so the rest of the animation can proceed without changing zoom.
                delete arg.zoom;
              } catch (e) {
                // Fallback for frozen, sealed, proxied, or otherwise non-writable objects where delete may fail.
                // In that case, preserve the current zoom level explicitly so the animation still runs but without zooming to 15.
                if (typeof this.getZoom === 'function') {
                  arg.zoom = this.getZoom();
                }
              }
            }
          }
        }

        // Delegate to the original OpenLayers animate() implementation with either the original or adjusted animation arguments.
        return origAnimate.apply(this, args);
      };

      // Mark the object as patched to avoid wrapping animate() multiple times, which could cause duplicate logic, harder debugging, or stacked wrappers.
      obj._isAnimatePatched = true;

      // Diagnostic log to confirm the patch was applied.
      console.log("Senderkataster Modder: OpenLayers View prototype patched!");
    }
  }

  // Intercept Object.assign() because some OpenLayers-related config/state objects may be assembled through object merging before the final view is fully initialized.
  // This gives us a chance to spot maxZoom: 15 and replace it with 22 while preserving the original call pattern.
  const originalAssign = Object.assign;

  Object.assign = function(target, ...sources) {
    // Create a patched copy of any source object that sets maxZoom to 15.
    const patchedSources = sources.map(source => {
      if (source && source.maxZoom !== undefined && source.maxZoom === 15) {
        try {
          // Shallow clone the source, then override just the maxZoom property.
          // Object.assign performs a shallow copy, because only changes one top-level property are needed.
          const cloned = Object.assign({}, source);
          cloned.maxZoom = 22;
          return cloned;
        } catch (e) {
          // If cloning fails for any reason, fall back to the original source rather than breaking Object.assign() entirely.
          return source;
        }
      }
      return source;
    });

    // Also try patching the assignment target in case it is or becomes a View-like object with an animate() method.
    patchViewPrototype(target);
    // Preserve normal Object.assign() behavior aside from the modified source objects described above.
    return originalAssign(target, ...patchedSources);
  };

  // Intercept Function.prototype.bind() because OpenLayers or surrounding code may bind methods to a view object before it is possible to get a clean chance to patch it.
  // By inspecting the bind context, it is possible to opportunistically patch any View-like object that exposes animate().
  const originalBind = Function.prototype.bind;
  Function.prototype.bind = function(context, ...args) {
    // Only inspect object contexts that look relevant. 
    // This keeps the patch narrower and avoids unnecessary work on unrelated bound functions.
    if (context && typeof context === 'object' && typeof context.animate === 'function') {
      patchViewPrototype(context);
    }
    // Forward to the native bind implementation unchanged.
    return originalBind.call(this, context, ...args);
  };
})();
// ------------------------------------------------------------------
// CSS INJECTIONS & UI TWEAKS
// Injects custom CSS into the document early to hide annoying teasers instantly and to fix UI default sizing issues inside the dynamically rendered Angular map popups.
const style = document.createElement('style');
style.textContent = `  
  /* Force override min-height on the OpenLayers popups to a more sensible value. */
  app-root .ol-popup.visible {
    min-height: 169px !important;
    padding: 0px !important;
  }

  /* Adjust scrollable areas inside the popup to a more sensible value. */
  app-root .popup-scroll-content {
    padding: 0px !important;
  }

  table {
    box-shadow: none !important;
  }

  /* Remove default padding from Angular components */
  app-root .ol-popup-content {
    padding: 0px !important;
  }

  /* Re-add controlled padding to headers */
  app-root .ol-popup.visible h3 {
    padding-top: 10px;
    padding-left: 10px;
  }

  /* Adjust the close button position */
  app-root .ol-popup-closer {
    top: 10px !important;
  }

  /* Adjust the margins of the footer text */
  app-root .footer-text {
    margin-left: 10px !important;
    margin-top: 5px !important;
    margin-bottom: 5px !important;
  }
  
  /* Remove vertical table cell padding for a more compact design. */
  table td {
    padding: 0px 10px !important;
  }

  app-root .popup-actions.popup-actions {
    padding-right: 34px !important;
    margin-top: 0px !important;
  }

  @media screen and (max-width: 1279px) {
    app-root .popup-scroll-content.popup-scroll-content {
      margin-bottom: 0px !important;
      max-height: calc(100% - 68px) !important;
    }
  }

  /* Responsive height adjustments for taller monitors */
  @media (min-height: 800px) and (max-height: 999px) and (min-width: 1280px) {
    app-root .ol-popup.visible {
      min-height: 169px !important;
      max-height: 358px !important;
      height: auto !important;
    }
      
    app-root .popup-scroll-content.popup-scroll-content {
      min-height: 189px !important;
      max-height: 296px !important;
      height: auto !important;
    }
  }

  /* Responsive height adjustments for very tall monitors */
  @media (min-height: 1000px) and (min-width: 1280px) {
    app-root .ol-popup.visible {
      min-height: 169px !important;
      max-height: 437px !important;
      height: auto !important;
    }

    app-root .popup-scroll-content.popup-scroll-content {
      min-height: 189px !important;
      max-height: 365px !important;
      height: auto !important;
    }
  }

  @media (min-width: 450px) {      
    app-root .ol-popup.visible {
      min-width: auto !important;
      width: 450px !important;
    }
  }

  @media (max-width: 449px) {
    app-root .ol-popup.visible {
      min-width: auto !important;
      width: 100% !important;
    }
  }
`;

function appendStyleToHead() {
  // Look up the document <head> element using the most direct API first.
  // The fallback querySelector('head') is only there in case document.head is
  // unavailable in an unusual environment.
  const head = document.head || document.querySelector('head');

  // If the page has no <head> element at all, it isn't possible to inject styles safely.
  // Return false so the caller can stop cleanly.
  if (!head) return false;

  // Avoid appending the same style node twice.
  //
  // If style is already the last child, it is already in the right place and re-appending would be redundant.
  if (head.lastElementChild !== style) {
    // Move the style element to the end of <head> so it loads after earlier styles and can reliably override them if needed.
    head.appendChild(style);
  }
  // Signal that the style node is now present in <head>.
  return true;
}


function styleInjection() {
  // Delegate the actual append logic to the helper above.
  const injected = appendStyleToHead();

  // Abort if the page has no usable <head> element.
  if (!injected) return false;

  // Re-resolve <head> in case the document structure changed or the helper returned successfully after a late DOM update.
  const head = document.head || document.querySelector('head');

  // Double-check whether the style node is still the last child.
  // This is defensive, but it also means the function can tolerate cases where other code rearranged the <head> after the first helper call.
  if (head && head.lastElementChild !== style) {
    head.appendChild(style);
  }

  // Report success to the caller.
  return true;
}

// ------------------------------------------------------------------
// IMPROVED TEASER CLOSING LOGIC
// The website shows a teaser panel on the right side of the screen or a full screen overlay that can be closed by clicking an "X" button. 
// However, this button is not present in the DOM immediately and only appears after some time. 
// This function uses a MutationObserver to watch for changes in the DOM and automatically clicks the close button as soon as it appears.
// This ensures a cleaner user experience without manual intervention especially for frequent users of the website.

// Tracks whether the teaser/dialog has already been closed successfully.
// Once this becomes true, tryDismiss() should stop doing any further work.
let teaserDismissed = false;

// Tracks whether the allowed time window for dismissing the teaser has expired.
// After 10 seconds, the script will no longer try to close it automatically.
let teaserTimeoutExpired = false;

// Start a one-time timer.
// After 10,000 ms (= 10 seconds), mark the timeout as expired.
setTimeout(() => {
  teaserTimeoutExpired = true;
}, 10000);

function tryDismiss() {
  // Stop immediately if the teaser was already dismissed earlier, or the 10-second timeout window has passed
  if (teaserDismissed || teaserTimeoutExpired) return;

  // 1. Desktop case:
  // Try to find the sidebar teaser close button by its ID.
  // If it exists, simulate a click on it to close the teaser panel.
  const closeTeaser = document.getElementById("close-teaser");

  if (closeTeaser) {
    // Programmatically click the close button
    closeTeaser.click();

    // Mark the teaser as dismissed to not try again later
    teaserDismissed = true;
    return;
  }

  // 2. Mobile case:
  // Look for Angular Material dialog containers currently present in the DOM.
  // querySelectorAll returns all matching dialog elements.
  const dialogs = document.querySelectorAll(".mat-mdc-dialog-container");

  // Loop through all found dialogs and try to identify the correct one
  for (const dialog of dialogs) {
    // Check whether this dialog contains the expected welcome text.
    if (dialog.textContent.includes("Willkommen beim Senderkataster")) {
      // Try to find a dedicated close button inside the dialog.
      const closeBtn = dialog.querySelector("[mat-dialog-close]");

      if (closeBtn) {
        // If such a close button exists, click it
        closeBtn.click();
      }

      // Mark this dialog as handled so the function does not keep trying to dismiss it repeatedly.
      teaserDismissed = true;
      return;
    }
  }
}

// ------------------------------------------------------------------
// DOM PARSING & INJECTION LOGIC
//
// Searches the DOM table rows sequentially to find the "Sendeleistung" associated with a specific "Protokoll(e)" row.
// Because the table structure lists protocols and power on separate rows, it is necessary to iterate forward.

function getSendeleistungForRow(protokollRow) {
  // Start scanning with the row immediately after the current "Protokoll(e)" row. 
  // nextElementSibling returns the next element node only, which is ideal here because it is only intended to move through table rows, not text nodes.
  let curr = protokollRow.nextElementSibling;

  // Walk downward through subsequent rows until either finding Sendeleistung or hitting the next protocol block.
  while (curr) {
    // Skip rows that were injected by this extension, because they are not part of the original station data and should not affect the lookup.
    if (!curr.classList.contains('extension-row')) {
      // Read the current row as a simple two-column label/value pair.
      const tds = curr.querySelectorAll('td');

      // Only consider rows that match the expected table format.
      // If the layout changes, this guard prevents false matches.
      if (tds.length >= 2) {
        // Normalize the left-hand label so matching is resilient to whitespace.
        const label = tds[0].textContent.trim();

        // The value is stored in the right-hand cell.
        // Return immediately once it was found, because the lookup is complete.
        if (label === 'Sendeleistung') {
          return tds[1].textContent.trim(); // Found the transmission power for this station block
        }

        // If the next "Protokoll(e)" row is encountered first, that means the current station block ended before a Sendeleistung row appeared.
        // Stop here to not accidentally read values from the next block.
        if (label === 'Protokoll(e)') break;
      }
    }
    // Move to the next row and continue the downward scan.
    curr = curr.nextElementSibling;
  }
  // No transmission power was found in the current block.
  return null;
}

// Resolve which operator owns the station by combining protocol labels, transmission power, and the current table context.
function resolveStation(protokolle, sendeleistung, table, currentRow) {
  // Direct protocol matches are the simplest case.
  // If the exact protocol string belongs to one operator's known list, return that operator immediately.
  if (protokolleA1.includes(protokolle)) {
    return [true, labelA1, colorA1];
  } else if (protokolleTmobile.includes(protokolle)) {
    return [true, labelTmobile, colorTMobile];
  } else if (protokolleDrei.includes(protokolle)) {
    return [true, labelDrei, colorDrei];
  } else if (protokolle === 'GSM, LTE' || protokolle === 'LTE') {
    // These protocol labels are ambiguous because more than one operator uses them. 
    // In this case transmission power is used as a tie-breaker.
    // That means this branch is not just a string match; it is a rule-based disambiguation step that depends on the surrounding row context.
    if (
      (sendeleistung === '135,00 W' && (protokolle === 'GSM, LTE' || protokolle === 'LTE')) ||
      (sendeleistung === '350,00 W' && protokolle === 'GSM, LTE')
    ) {
      // This power/protocol combination maps to Drei in the current ruleset.
      return [true, labelDrei, colorDrei];
    } else {
      // If the power does not match the Drei-specific case, fall back to A1.
      return [true, labelA1, colorA1];
    }
  }
  // No rule matched, so return an explicit "not found" result.
  // Keeping the return shape consistent avoids extra checks in the caller.
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

  // Keeps track of which value from latestLeistungen should be used next
  let leistungIndex = 0;

  // REPLACE Sendeleistung VALUES
  // Go through every table row inside popupContent and look for rows whose first cell label is Sendeleistung
  popupContent.querySelectorAll('tr').forEach(row => {
    // Get all table cells in the current row
    const tds = row.querySelectorAll('td');

    // Only handle rows that have exactly 2 cells and then check whether the label cell contains "Sendeleistung"
    if (tds.length === 2 && tds[0].textContent.trim() === 'Sendeleistung') {
      // Make sure that there is still a value available in latestLeistungen before trying to replace the current cell content
      if (leistungIndex < latestLeistungen.length) {
        // Replace the value cell with the next leistung value and append W for watts
        tds[1].textContent = latestLeistungen[leistungIndex] + ' W';

        // Move to the next value so the next matching row gets the next entry from latestLeistungen
        leistungIndex++;
      }
    }
  });

  // INJECT Phase
  // Scan every table row in the popup and look for the native row whose left cell is exactly "Protokoll(e)". 
  // For each such row, try to insert a derived "Netzbetreiber" row directly above it.
  popupContent.querySelectorAll('tr').forEach(row => {
    // Skip previously injected rows.
    // Without this guard, a later rerun of the logic could inspect the custom row as if it were original source data and potentially duplicate or corrupt the output structure.
    if (row.classList.contains('extension-row')) return;

    // Read all cells in the current row.
    const tds = row.querySelectorAll('td');

    // Only process simple two-column rows.
    // If the popup layout changes in the future, this avoids operating on header rows, nested tables, malformed rows, or other structures that do not match the expected "label/value" format.
    if (tds.length !== 2) return;

    // Only continue when the first column is the native protocol label.
    if (tds[0].textContent.trim() !== 'Protokoll(e)') return;

    // Resolve surrounding context needed by the station lookup logic including the nearest containing table for broader context, the raw protocol string from the right cell and the transmission power derived from a nearby row
    const table = row.closest('table');
    const protokolle = tds[1].textContent.trim();
    const sendeleistung = getSendeleistungForRow(row);

    // Try to resolve the operator from the available row context.
    // This keeps the rendering logic separate from the station matching logic.
    const resolutionResult = resolveStation(protokolle, sendeleistung, table, row);

    // Only inject a row when the resolution step successfully found a result.
    if (resolutionResult[0]) {
      // Prevent duplicate insertion on repeated observer passes.
      // The script runs multiple times as the popup DOM changes. 
      // If an extension row was already inserted immediately before this protocol row, leave the DOM untouched.
      if (row.previousElementSibling && row.previousElementSibling.classList.contains('extension-row')) return;

      // Build a new table row that visually blends into the original popup table.
      const newRow = document.createElement('tr');
      const td1 = document.createElement('td');
      const td2 = document.createElement('td');

      // Left cell: custom label indicating this is an added enhancement row.
      td1.textContent = 'Netzbetreiber (Erweiterung)';

      // Right cell: resolved operator name or value returned by resolveStation().
      td2.textContent = resolutionResult[1];

      // Copy attributes from the original row and cells so the injected row inherits existing classes, inline styles, alignment rules, data-attributes, and other markup details used by the popup styling.
      Array.from(row.attributes).forEach(attr => newRow.setAttribute(attr.nodeName, attr.nodeValue));
      Array.from(tds[0].attributes).forEach(attr => td1.setAttribute(attr.nodeName, attr.nodeValue));
      Array.from(tds[1].attributes).forEach(attr => td2.setAttribute(attr.nodeName, attr.nodeValue));

      // Add the marker class after cloning attributes to reliably identify extension rows later, even if the original row already had classes copied.
      newRow.classList.add('extension-row');

      // Apply a result-specific background color to make the classification easier to recognize visually.
      newRow.style.backgroundColor = resolutionResult[2];

      // Assemble the final row structure.
      newRow.appendChild(td1);
      newRow.appendChild(td2);

      // Insert the custom row immediately before the matching "Protokoll(e)" row, so the derived operator information appears directly next to the source data it was computed from.
      row.insertAdjacentElement('beforebegin', newRow);
    }
  });
}

// A MutationObserver watches for DOM updates anywhere in the document subtree.
// This is useful because the popup content is updated after the initial page load, so a one-time scan on startup would miss later popup changes.
const observer = new MutationObserver((mutations) => {
  // Disconnect before processing to prevent feedback loops.
  // runExtensionLogic() modifies the DOM by inserting rows, and those changes would themselves trigger the observer again. 
  // Temporarily disconnecting keeps one batch of updates from recursively spawning another.
  observer.disconnect();

  try {
    // Make sure the custom CSS exists before any popup rows are injected, so added content is styled correctly the moment it appears.
    styleInjection();

    // Try to dismiss teaser UI early, but only while the dismissal window is still valid.
    if (!teaserDismissed && !teaserTimeoutExpired) {
      tryDismiss();
    }

    // Inspect each mutation record supplied in the current batch.
    for (let mutation of mutations) {
      // Only work with element targets. 
      // This ignores text-only nodes and other node types that cannot meaningfully participate in closest().
      if (mutation.target && mutation.target.nodeType === Node.ELEMENT_NODE) {
        // Run popup processing only when the mutation happened directly on #popup-content, or somewhere inside #popup-content
        // This avoids rerunning the extension logic for unrelated DOM changes elsewhere on the page.
        if (mutation.target.id === 'popup-content' || mutation.target.closest('#popup-content')) {
          runExtensionLogic();
          // Stop after the first relevant popup mutation in this batch.
          // One rerun is enough because runExtensionLogic() scans the current popup state as a whole; repeating it for every matching mutation would be redundant work.
          break;
        }
      }
    }
  } finally {
    // Always reconnect the observer, even if an error occurred while processing mutations.
    observer.observe(document.documentElement, {
      childList: true,
      subtree: true,
      characterData: true
    });
  }
});

// Start the observer and inject styles once the page is ready.
function initializeObserver() {
  // Ensure styles are available immediately, even before the first mutation.
  styleInjection();

  // Observe the whole document because popup DOM is created dynamically and not present at initial parse time.
  observer.observe(document.documentElement, {
    childList: true,
    subtree: true,
    characterData: true
  });
}

// Wait until the HTML document has been parsed before initializing.
// DOMContentLoaded fires after the document is parsed and deferred/module scripts have executed, but it does not wait for images or other external resources, which makes it a good point to attach DOM-dependent behavior. [web:26][web:24]
document.addEventListener('DOMContentLoaded', initializeObserver);