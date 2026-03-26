// ==============================================================================
// 1. INTERACTION TRACKER
// ==============================================================================
// We track if your last click was on the map canvas itself, or on the outer UI
let lastInteractionWasMap = false;

window.addEventListener('pointerdown', (e) => {
    // .ol-viewport is the container OpenLayers uses for the map canvas
    if (e.target && e.target.closest) {
        lastInteractionWasMap = e.target.closest('.ol-viewport') !== null;
    }
}, { capture: true, passive: true });


// ==============================================================================
// 2. UNIVERSAL OPENLAYERS PROTOTYPE HIJACK (V8 Engine Level)
// ==============================================================================
(function() {
    function patchViewPrototype(obj) {
        if (obj && typeof obj === 'object' && typeof obj.animate === 'function' && !obj._isAnimatePatched) {
            
            const origAnimate = obj.animate;
            obj.animate = function(...args) {
                for (let i = 0; i < args.length; i++) {
                    let arg = args[i];
                    if (arg && typeof arg === 'object' && arg.zoom === 15) {
                        // If you clicked the map (a marker popup), DELETE the zoom instruction
                        // If you clicked the UI (GPS / Search), allow the zoom to happen naturally
                        if (lastInteractionWasMap) {
                            try {
                                delete arg.zoom;
                            } catch (e) {
                                if (typeof this.getZoom === 'function') {
                                    arg.zoom = this.getZoom();
                                }
                            }
                        }
                    }
                }
                return origAnimate.apply(this, args);
            };
            
            if (typeof obj.setZoom === 'function') {
                const origSetZoom = obj.setZoom;
                obj.setZoom = function(zoom) {
                    if (zoom === 15 && lastInteractionWasMap && typeof this.getZoom === 'function') {
                        zoom = this.getZoom();
                    }
                    return origSetZoom.call(this, zoom);
                };
            }
            
            obj._isAnimatePatched = true;
            console.log("Senderkataster Modder: OpenLayers View prototype patched!");
        }
    }

    const originalDefineProperty = Object.defineProperty;
    Object.defineProperty = function(obj, prop, descriptor) {
        // Unlock global maxZoom limits natively so manual zoom to 22 works everywhere
        if (prop === 'maxZoom' && descriptor && descriptor.value !== undefined) {
            descriptor.value = 22;
        }
        // Expand strict tile grids natively
        if (prop === 'resolutions' && descriptor && Array.isArray(descriptor.value)) {
            const res = descriptor.value;
            if (res.length > 0 && res.length < 23) {
                let lastRes = res[res.length - 1];
                while (res.length <= 22) {
                    lastRes = lastRes / 2;
                    res.push(lastRes);
                }
                descriptor.value = res;
            }
        }

        patchViewPrototype(obj);
        return originalDefineProperty(obj, prop, descriptor);
    };

    const originalAssign = Object.assign;
    Object.assign = function(target, ...sources) {
        sources.forEach(source => {
            if (source) {
                if (source.maxZoom !== undefined && source.maxZoom === 15) {
                    source.maxZoom = 22;
                }
            }
        });
        patchViewPrototype(target);
        return originalAssign(target, ...sources);
    };

    const originalBind = Function.prototype.bind;
    Function.prototype.bind = function(context, ...args) {
        patchViewPrototype(context);
        return originalBind.call(this, context, ...args);
    };
})();


// ==============================================================================
// 3. CSS INJECTIONS & UI TWEAKS
// ==============================================================================
// Injecting CSS ensures the teaser is hidden instantly before the page even renders,
// preventing any annoying layout shifts or "flashes" of the popup.
const style = document.createElement('style');
style.textContent = `
  #teaser-container {
    display: none !important;
  }
  
  /* NEW: Force min-height on dynamic Angular popups */
  .ol-popup.visible {
    min-height: 169px !important;
    padding: 0px !important;
  }

  .popup-scroll-content {
    height: 189px !important;
    padding: 0px !important;
  }

  .ol-popup-content.ng-star-inserted {
    padding: 0px !important;
  }

  .ol-popup.visible h3 {
    padding-top: 10px;
    padding-left: 10px;
  }

  .ol-popup-closer {
    top: 10px !important;
  }

  .footer-text.ng-star-inserted {
    display: none
  }
  table td {
    padding: 0px 10px !important;
  }

  @media (min-height: 800px) and (max-height: 999px) {
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

  @media (min-height: 1000px) {
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
`;
// Safely append to documentElement because document.head might not exist yet at document_start
document.documentElement.appendChild(style);


// ==============================================================================
// 4. YOUR EXISTING DOM PARSING & INJECTION LOGIC
// ==============================================================================

function getSendeleistungForRow(protokollRow) {
  let curr = protokollRow.nextElementSibling;
  while (curr) {
    if (!curr.classList.contains('extension-row')) {
      const tds = curr.querySelectorAll('td');
      if (tds.length >= 2) {
        const label = tds[0].textContent.trim();
        if (label === 'Sendeleistung') {
          return tds[1].textContent.trim();
        }
        if (label === 'Protokoll(e)') break;
      }
    }
    curr = curr.nextElementSibling;
  }
  return null;
}

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

function getExistingOperators(table) {
  const ops = new Set();
  if (!table) return ops;
  
  table.querySelectorAll('tr').forEach(tr => {
    if (tr.classList.contains('extension-row')) return;
    
    const tds = tr.querySelectorAll('td');
    if (tds.length >= 2 && tds[0].textContent.trim() === 'Protokoll(e)') {
      const prot = tds[1].textContent.trim();
      
      if (['LTE, 5G', 'GSM, LTE, 5G'].includes(prot)) ops.add("A1 Telekom Austria AG");
      if (['2G, 4G', '4G', '2G, 4G, 5G'].includes(prot)) ops.add("T-Mobile Austria GmbH");
      if (['5G, GSM, LTE'].includes(prot)) ops.add("Hutchison Drei Austria GmbH");
      
      if (prot === 'GSM, LTE') {
        const sl = getSendeleistungForRow(tr);
        if (sl && sl !== '120-140 W' && sl !== '340-360 W') {
          ops.add("A1 Telekom Austria AG");
        } else {
          ops.add("Hutchison Drei Austria GmbH oder A1 Telekom Austria AG");
        }
      }
    }
  });
  return ops;
}

function resolveStation(protokolle, sendeleistung, table, currentRow) {
    const colorA1 = '#ffc1c1';
    const colorA1oderDrei = '#e6f2ff';
    const colorTMobile = '#fce4ec';
    const colorDrei = '#fff3e0';

    if (['LTE, 5G', 'GSM, LTE, 5G'].includes(protokolle)) {
        return [true, "A1 Telekom Austria AG", colorA1];
    } else if (['2G, 4G', '4G', '2G, 4G, 5G'].includes(protokolle)) {
        return [true, "T-Mobile Austria GmbH", colorTMobile];
    } else if (['5G, GSM, LTE'].includes(protokolle)) {
        return [true, "Hutchison Drei Austria GmbH", colorDrei];
    } else if (protokolle === 'GSM, LTE') {
        if (sendeleistung !== '120-140 W' && sendeleistung !== '340-360 W') {
            return [true, "A1 Telekom Austria AG", colorA1];
        } else {
            const existingOps = getExistingOperators(table);
            if (existingOps.has("A1 Telekom Austria AG")) {
                return [true, "Hutchison Drei Austria GmbH", colorDrei];
            } else if (existingOps.has("Hutchison Drei Austria GmbH")) {
                return [true, "A1 Telekom Austria AG", colorA1];
            } else {
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
                    if (index === 0) {
                        return [true, "A1 Telekom Austria AG", colorA1];
                    } else if (index % 2 !== 0) {
                        return [true, "Hutchison Drei Austria GmbH", colorDrei];
                    } else {
                        return [true, "A1 Telekom Austria AG", colorA1];
                    }
                }

                return [true, "Hutchison Drei Austria GmbH oder A1 Telekom Austria AG", colorA1oderDrei];
            }
        }
    }
    return [false, "", ""];
}

function runExtensionLogic() {
    const popupContent = document.getElementById('popup-content');
    if (!popupContent) return;

    // 1. CLEANUP...
    popupContent.querySelectorAll('.extension-row').forEach(customRow => {
        const nextRow = customRow.nextElementSibling;
        if (!nextRow) {
            customRow.remove();
            return;
        }
        const tds = nextRow.querySelectorAll('td');
        if (tds.length === 2 && tds[0].textContent.trim() !== 'Protokoll(e)') {
            customRow.remove();
            return;
        }

        const table = nextRow.closest('table');
        const protokolle = tds[1].textContent.trim();
        const sendeleistung = getSendeleistungForRow(nextRow);
        
        // Use nextRow here
        const resolutionResult = resolveStation(protokolle, sendeleistung, table, nextRow);
        
        const currentOperatorTd = customRow.querySelector('td:nth-child(2)');
        const currentOperator = currentOperatorTd ? currentOperatorTd.textContent.trim() : "";

        if (!resolutionResult[0] || resolutionResult[1] !== currentOperator) {
            customRow.remove();
        } else {
            customRow.style.backgroundColor = resolutionResult[2];
        }
    });

    // 2. INJECT
    popupContent.querySelectorAll('tr').forEach(row => {
        if (row.classList.contains('extension-row')) return;
        
        const tds = row.querySelectorAll('td');
        if (tds.length !== 2) return;
        if (tds[0].textContent.trim() !== 'Protokoll(e)') return;

        const table = row.closest('table');
        const protokolle = tds[1].textContent.trim();
        const sendeleistung = getSendeleistungForRow(row);
        
        // Use row here
        const resolutionResult = resolveStation(protokolle, sendeleistung, table, row);

        if (resolutionResult[0]) {
            if (row.previousElementSibling && row.previousElementSibling.classList.contains('extension-row')) return;

            const newRow = document.createElement('tr');
            const td1 = document.createElement('td');
            const td2 = document.createElement('td');

            td1.textContent = 'Netzbetreiber (Erweiterung)';
            td2.textContent = resolutionResult[1];

            Array.from(row.attributes).forEach(attr => newRow.setAttribute(attr.nodeName, attr.nodeValue));
            Array.from(tds[0].attributes).forEach(attr => td1.setAttribute(attr.nodeName, attr.nodeValue));
            Array.from(tds[1].attributes).forEach(attr => td2.setAttribute(attr.nodeName, attr.nodeValue));

            newRow.classList.add('extension-row');
            newRow.style.backgroundColor = resolutionResult[2];
            newRow.appendChild(td1);
            newRow.appendChild(td2);

            row.insertAdjacentElement('beforebegin', newRow);
        }
    });
}

const observer = new MutationObserver((mutations) => {
  observer.disconnect();
  try {
    for (let mutation of mutations) {
      if (mutation.target && mutation.target.nodeType === Node.ELEMENT_NODE) {
        if (mutation.target.id === 'popup-content' || mutation.target.closest('#popup-content')) {
          runExtensionLogic();
          break; 
        }
      }
    }
  } finally {
    const mapContainer = document.getElementById('map-container') || document.body;
    if (mapContainer) observer.observe(mapContainer, { childList: true, subtree: true, characterData: true });
  }
});

function initializeObserver() {
  runExtensionLogic();
  const mapContainer = document.getElementById('map-container') || document.body;
  if (mapContainer) observer.observe(mapContainer, { childList: true, subtree: true, characterData: true });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initializeObserver);
} else {
  initializeObserver();
}