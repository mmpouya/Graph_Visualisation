// ECharts and N3.js must be loaded via <script> tags in HTML first.
// The myChart variable will be initialized in the HTML file.

// Utility function: generate a random hex color.
function getRandomColor() {
    return '#' + Math.floor(Math.random() * 0xffffff).toString(16).padStart(6, '0');
  }
  
  // Main ECharts option structure (will be populated by TTL data)
  var option = {
    title: {
      text: 'Graph from TTL data'
    },
    tooltip: {
      formatter: function (params) {
          if (params.dataType === 'node' && params.data) {
              let tip = params.data.name;
              if (params.data.properties) {
                  for (const prop in params.data.properties) {
                      tip += `<br/>${prop}: ${params.data.properties[prop]}`;
                  }
              }
              return tip;
          } else if (params.dataType === 'edge' && params.data.label && params.data.label.text) {
              return params.data.label.text;
          }
          return params.name; // Fallback
      }
    },
    animationDurationUpdate: 1500,
    animationEasingUpdate: 'quinticInOut',
    legend: {
      data: [] // Will be populated by categories from TTL data
    },
    series: [
      {
        type: 'graph',
        layout: 'force',
        draggable: true,
        label: {
          show: true,
          position: 'right',
          formatter: '{b}' // Shows node name
        },
        itemStyle: {
          // Default color, can be overridden by categories or specific node styles
          // color: '#5470c6'
        },
        categories: [], // Will be populated by extractCategories
        symbolSize: 50,
        edgeSymbol: ['circle', 'arrow'],
        edgeSymbolSize: [4, 10],
        edgeLabel: {
          show: true,
          formatter: function (params) {
            return params.data && params.data.label && params.data.label.text
              ? params.data.label.text
              : '';
          },
          fontSize: 10 // Smaller font for edge labels
        },
        force: {
          edgeLength: 200, // Increased for better readability with more nodes
          repulsion: 1000,  // Increased
          gravity: 0.1
        },
        data: [], // Will be populated by loadAndVisualizeGraph
        links: [], // Will be populated by loadAndVisualizeGraph
        lineStyle: {
          opacity: 0.9,
          width: 2,
          curveness: 0
        }
      }
    ]
  };
  
  // ---- RDF/TTL Parsing and Transformation Functions ----
 var myChart;

// ---- Notification/Toast System ----
function showNotification(message, type = 'info', duration = 3500) {
    const area = document.getElementById('notificationArea');
    if (!area) return alert(message); // fallback
    const notif = document.createElement('div');
    notif.textContent = message;
    notif.style.background = type === 'error' ? '#ffdddd' : (type === 'success' ? '#d4edda' : '#e9ecef');
    notif.style.color = '#333';
    notif.style.border = type === 'error' ? '1px solid #e3342f' : (type === 'success' ? '1px solid #38c172' : '1px solid #bfc8d0');
    notif.style.padding = '12px 20px';
    notif.style.marginBottom = '10px';
    notif.style.borderRadius = '6px';
    notif.style.boxShadow = '0 2px 8px rgba(0,0,0,0.07)';
    notif.style.fontSize = '1em';
    notif.style.opacity = '0.98';
    notif.style.transition = 'opacity 0.4s';
    area.appendChild(notif);
    setTimeout(() => {
        notif.style.opacity = '0';
        setTimeout(() => area.removeChild(notif), 400);
    }, duration);
}

async function loadAndVisualizeGraph() {
    if (typeof N3 === 'undefined') {
        console.error("N3.js library is not loaded.");
        showNotification("Critical Error: N3.js library is not loaded. Please ensure it's included in your HTML.", 'error');
        return;
    }
    if (typeof myChart === 'undefined' || !myChart) {
        console.error("ECharts 'myChart' instance not found.");
        showNotification("Critical Error: ECharts 'myChart' instance not found. Please ensure it's initialized.", 'error');
        return;
    }

    const fileInput = document.getElementById('fileInput');
    if (!fileInput || !fileInput.files || fileInput.files.length === 0) {
        console.warn("No file selected.");
        showNotification("Please select a TTL file first using the 'Choose File' button.", 'warning');
        return;
    }

    const file = fileInput.files[0];
    const reader = new FileReader();

    myChart.showLoading({ 
        text: `Loading and parsing: ${file.name}...`,
        color: '#5470c6',
        textColor: '#333',
        maskColor: 'rgba(255, 255, 255, 0.8)',
        zlevel: 0
    });

    reader.onload = function(event) {
        const ttlData = event.target.result;
        const parser = new N3.Parser();
        const store = new N3.Store();
        let parsingError = null;

        try {
            parser.parse(ttlData, (error, quad, prefixes) => {
                if (parsingError) return;
                if (error) {
                    parsingError = error;
                    console.error("Error during N3 parsing:", error);
                    return;
                }
                if (quad) {
                    store.addQuad(quad);
                } else {
                    myChart.hideLoading();
                    if (parsingError) {
                        showNotification(`Error parsing TTL file '${file.name}':\n${parsingError.message}\n\nCheck console for more details.`, 'error', 6000);
                        return; 
                    }
                    console.log(`TTL parsing complete for '${file.name}'. Prefixes:`, prefixes);
                    console.log("Total quads parsed:", store.size);
                    if (store.size === 0) {
                        showNotification(`The TTL file '${file.name}' is empty or does not contain any valid triples that could be visualized.`, 'warning', 6000);
                        option.series[0].data = [];
                        option.series[0].links = [];
                        option.series[0].categories = [];
                        option.legend.data = [];
                        myChart.setOption(option, true);
                        return;
                    }
                    try {
                        const { nodes, links } = transformRdfToEcharts(store, prefixes);
                        console.log(`Transformed data for '${file.name}'. Nodes: ${nodes.length}, Links: ${links.length}`);
                        let message = `Successfully loaded and visualized '${file.name}'.`;
                        if (nodes.length === 0 && links.length === 0 && store.size > 0) {
                             console.warn("TTL data was parsed, but transformation resulted in an empty graph.");
                             message = `Data from '${file.name}' was parsed (${store.size} triples), but it resulted in an empty graph. Check if the data structure is suitable for the visualizer.`;
                        }
                        showNotification(message, 'success', 4000);
                        option.series[0].data = nodes;
                        option.series[0].links = links;
                        const categories = extractCategories(nodes);
                        option.series[0].categories = categories;
                        option.legend.data = categories.map(c => c.name);
                        myChart.setOption(option, true);
                        console.log("ECharts option set with new data from", file.name);
                    } catch (transformError) {
                        myChart.hideLoading();
                        console.error("Error transforming RDF to ECharts data:", transformError);
                        showNotification(`Error processing graph data from '${file.name}':\n${transformError.message}`, 'error', 6000);
                    }
                }
            });
        } catch (e) {
            myChart.hideLoading();
            console.error("Synchronous error during parsing setup:", e);
            showNotification(`Critical error during TTL parsing setup for '${file.name}':\n${e.message}`, 'error', 6000);
        }
    };

    reader.onerror = function(error) {
        myChart.hideLoading();
        console.error("Error reading file:", error);
        showNotification(`Error reading file '${file.name}':\n${error.message}`, 'error', 6000);
    };

    reader.readAsText(file);
}

// --- Initialization logic (should be at the end of your script or in a DOMContentLoaded listener) ---
document.addEventListener('DOMContentLoaded', () => {
    const chartDom = document.getElementById('echartsContainer') || document.getElementById('main');
    const fileInput = document.getElementById('fileInput');
    const loadButton = document.getElementById('loadButton');
    const fileNameDisplay = document.getElementById('fileNameDisplay');
    const fileInfoDisplay = document.getElementById('fileInfoDisplay');
    const resetZoomBtn = document.getElementById('resetZoomBtn');
    const fitViewBtn = document.getElementById('fitViewBtn');
    const clearGraphBtn = document.getElementById('clearGraphBtn');
    const zoomInBtn = document.getElementById('zoomInBtn');
    const zoomOutBtn = document.getElementById('zoomOutBtn');
    const toggleGridBtn = document.getElementById('toggleGridBtn');
    const helpButton = document.getElementById('helpButton');
    const helpModal = document.getElementById('helpModal');
    const closeHelpModal = document.getElementById('closeHelpModal');
    const graphGrid = document.getElementById('graphGrid');
    const movingBg = document.getElementById('movingBg');

    if (!chartDom) {
        showNotification("ECharts container element not found.", 'error');
        return;
    }
    if (!fileInput || !loadButton || !fileNameDisplay) {
        showNotification("Required HTML control elements (fileInput, loadButton, fileNameDisplay) not found.", 'error');
        return;
    }
    
    if (typeof option === 'undefined') {
        showNotification("Global 'option' object for ECharts is not defined.", 'error');
        return;
    }

    myChart = echarts.init(chartDom);
    myChart.setOption(option);

    if (typeof registerEventHandlers === 'function') {
        registerEventHandlers();
    }

    // --- Enhanced File Input Feedback ---
    fileInput.addEventListener('change', () => {
        if (fileInput.files.length > 0) {
            const file = fileInput.files[0];
            fileNameDisplay.textContent = `Selected file: ${file.name}`;
            fileInfoDisplay.textContent = `Type: ${file.type || 'unknown'} | Size: ${(file.size/1024).toFixed(1)} KB`;
            loadButton.disabled = false;
        } else {
            fileNameDisplay.textContent = 'No file selected.';
            fileInfoDisplay.textContent = '';
            loadButton.disabled = true;
        }
    });

    // --- Help Modal Logic ---
    if (helpButton && helpModal && closeHelpModal) {
        helpButton.addEventListener('click', () => {
            helpModal.style.display = 'flex';
        });
        closeHelpModal.addEventListener('click', () => {
            helpModal.style.display = 'none';
        });
        helpModal.addEventListener('click', (e) => {
            if (e.target === helpModal) helpModal.style.display = 'none';
        });
        document.addEventListener('keydown', (e) => {
            if (helpModal.style.display === 'flex' && (e.key === 'Escape' || e.key === 'Esc')) {
                helpModal.style.display = 'none';
            }
        });
    }

    // --- Graph Controls ---
    let currentZoom = 1;
    function setZoom(zoom) {
        currentZoom = Math.max(0.2, Math.min(zoom, 3));
        chartDom.style.transform = `scale(${currentZoom})`;
        chartDom.style.transformOrigin = 'center center';
    }
    if (zoomInBtn) {
        zoomInBtn.addEventListener('click', () => {
            setZoom(currentZoom + 0.1);
        });
    }
    if (zoomOutBtn) {
        zoomOutBtn.addEventListener('click', () => {
            setZoom(currentZoom - 0.1);
        });
    }
    if (resetZoomBtn) {
        resetZoomBtn.addEventListener('click', () => {
            setZoom(1);
            if (myChart) myChart.dispatchAction({ type: 'restore' });
        });
    }
    if (fitViewBtn) {
        fitViewBtn.addEventListener('click', () => {
            setZoom(1);
            if (myChart) myChart.resize();
        });
    }
    if (clearGraphBtn) {
        clearGraphBtn.addEventListener('click', () => {
            option.series[0].data = [];
            option.series[0].links = [];
            option.series[0].categories = [];
            option.legend.data = [];
            myChart.setOption(option, true);
            showNotification('Graph cleared.', 'info');
        });
    }

    // --- Grid Overlay ---
    if (graphGrid && toggleGridBtn) {
        // SVG grid pattern
        const gridSVG = `<svg width="100%" height="100%" xmlns="http://www.w3.org/2000/svg"><defs><pattern id="smallGrid" width="40" height="40" patternUnits="userSpaceOnUse"><path d="M 40 0 L 0 0 0 40" fill="none" stroke="#fff" stroke-width="1.2"/></pattern></defs><rect width="100%" height="100%" fill="url(#smallGrid)"/></svg>`;
        graphGrid.innerHTML = gridSVG;
        toggleGridBtn.addEventListener('click', () => {
            if (graphGrid.style.display === 'none' || !graphGrid.style.display) {
                graphGrid.style.display = 'block';
            } else {
                graphGrid.style.display = 'none';
            }
        });
    }

    // --- Moving Background ---
    if (movingBg) {
        movingBg.style.background = 'linear-gradient(120deg, #f0f2f5 0%, #e0e7ef 100%)';
        movingBg.style.backgroundSize = '200% 200%';
        movingBg.style.animation = 'moveBgAnim 8s linear infinite';
        // Add keyframes via JS if not present
        if (!document.getElementById('moveBgAnimStyle')) {
            const style = document.createElement('style');
            style.id = 'moveBgAnimStyle';
            style.innerHTML = `@keyframes moveBgAnim { 0% {background-position: 0% 50%;} 100% {background-position: 100% 50%;}}`;
            document.head.appendChild(style);
        }
    }

    // --- Load Button ---
    loadButton.addEventListener('click', loadAndVisualizeGraph);
    loadButton.disabled = !fileInput.files.length;

    // --- Initial file info ---
    if (fileInput.files.length > 0) {
        const file = fileInput.files[0];
        fileNameDisplay.textContent = `Selected file: ${file.name}`;
        fileInfoDisplay.textContent = `Type: ${file.type || 'unknown'} | Size: ${(file.size/1024).toFixed(1)} KB`;
        loadButton.disabled = false;
    } else {
        fileNameDisplay.textContent = 'No file selected.';
        fileInfoDisplay.textContent = '';
        loadButton.disabled = true;
    }

    console.log("Graph visualizer initialized. Ready to load TTL files.");
});
  
  function transformRdfToEcharts(store, prefixes) {
      const nodes = [];
      const links = [];
      const nodeMap = new Map(); // To keep track of nodes and their array indices
  
      // Helper to get a potentially prefixed name or full URI
      function getTermName(term) {
          if (term.termType === 'NamedNode') {
              for (const prefix in prefixes) {
                  if (term.value.startsWith(prefixes[prefix])) {
                      return prefix + ':' + term.value.substring(prefixes[prefix].length);
                  }
              }
              return term.value;
          } else if (term.termType === 'BlankNode') {
              return '_:' + term.value;
          } else if (term.termType === 'Literal') {
              return term.value;
          }
          return term.value; // Should not happen for well-formed RDF terms
      }
  
      store.getQuads().forEach(quad => {
          const subjectId = getTermName(quad.subject);
          const predicateId = getTermName(quad.predicate);
          const objectId = getTermName(quad.object);
  
          // Add subject node if not already added
          if (!nodeMap.has(subjectId)) {
              // Determine if this node should be a rhombus (diamond)
              let nodeSymbol = undefined;
              if (typeof subjectId === 'string' && subjectId.startsWith('go:')) {
                  nodeSymbol = 'diamond';
              }
              nodes.push({
                  id: subjectId, // Use URI/blank node ID as ECharts ID
                  name: subjectId, // Initial name, might be updated by literal
                  category: guessCategory(quad.subject, store, prefixes, getTermName),
                  properties: {}, // To store literal properties
                  fixed: false,
                  expanded: false,
                  ...(nodeSymbol ? { symbol: nodeSymbol } : {})
              });
              nodeMap.set(subjectId, nodes[nodes.length - 1]);
          }
          const subjectNode = nodeMap.get(subjectId);
  
          if (quad.object.termType === 'NamedNode' || quad.object.termType === 'BlankNode') {
              if (!nodeMap.has(objectId)) {
                  // Determine if this node should be a rhombus (diamond)
                  let nodeSymbol = undefined;
                  if (typeof objectId === 'string' && objectId.startsWith('go:')) {
                      nodeSymbol = 'diamond';
                  }
                  nodes.push({
                      id: objectId,
                      name: objectId,
                      category: guessCategory(quad.object, store, prefixes, getTermName),
                      properties: {},
                      fixed: false,
                      expanded: false,
                      ...(nodeSymbol ? { symbol: nodeSymbol } : {})
                  });
                  nodeMap.set(objectId, nodes[nodes.length - 1]);
              }
              links.push({
                  source: subjectId, // Use ID for source
                  target: objectId, // Use ID for target
                  label: { show: true, text: predicateId },
                  lineStyle: { curveness: Math.random() * 0.2 } // Add some variance if many parallel edges
              });
          } else if (quad.object.termType === 'Literal') {
              // Store literal as a property of the subject node
              if (!subjectNode.properties) subjectNode.properties = {};
              subjectNode.properties[predicateId] = objectId; // objectId here is the literal value
  
              // If it's a common naming predicate, update the node's display name
              if (predicateId.endsWith(':hasName') || predicateId.endsWith('#label') || predicateId.endsWith('#label') || predicateId.endsWith('rdfs:label')) {
                  subjectNode.name = objectId; // Update name to the literal value
              }
          }
      });
      
      // Post-process names if a display name was preferred but ID is different
      nodes.forEach(node => {
          if (node.name !== node.id && node.properties) {
               // Check if an explicit name was set that is different from its ID
               // If the name property itself is the ID, but we have a label from properties, prefer that.
              let potentialName = node.id; // fallback
              const namePredicates = ['rdfs:label', 'go:hasName', 'skos:prefLabel']; // Add more as needed
              for(const p of namePredicates) {
                  if(node.properties[p]) {
                      potentialName = node.properties[p];
                      break;
                  }
              }
              // To make it more readable if the ID is a long URI
              if (node.name === node.id && potentialName !== node.id) {
                   node.name = `${potentialName} (${node.id.split('/').pop().split('#').pop()})`;
              } else {
                   node.name = node.name; // Already set or no better alternative
              }
          } else if (node.name === node.id) { // if name is still the full ID, try to shorten it
              node.name = node.id.split('/').pop().split('#').pop();
          }
      });
  
      return { nodes, links };
  }
  
  function guessCategory(term, store, prefixes, getTermNameFunc) {
      const typePredicate = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#type';
      const typeQuads = store.getQuads(term, typePredicate, null, null);
      if (typeQuads.length > 0) {
          // Use the local part of the first rdf:type as category
          const typeUri = typeQuads[0].object.value;
          let categoryName = getTermNameFunc(typeQuads[0].object); // Use the prefixed name if possible
          // Fallback for very long URIs if no prefix matches
          if (categoryName === typeUri && typeUri.includes('/')) categoryName = typeUri.substring(typeUri.lastIndexOf('/') + 1);
          if (categoryName === typeUri && typeUri.includes('#')) categoryName = typeUri.substring(typeUri.lastIndexOf('#') + 1);
          return categoryName;
      }
      return 'Unknown'; // Default category
  }
  
  function extractCategories(nodes) {
      const categorySet = new Set();
      nodes.forEach(node => {
          if (node.category) categorySet.add(node.category);
          else categorySet.add('Unknown');
      });
      return Array.from(categorySet).map(catName => ({ name: catName, itemStyle: { color: getRandomColor() } }));
  }
  
  
  // ---- Event Handlers (adapted from original graph-4.js) ----
  // These are registered in the HTML file after myChart is initialized.
  
  function registerEventHandlers() {
      if (typeof myChart === 'undefined') {
          console.error("ECharts 'myChart' instance not found. Cannot register event handlers.");
          return;
      }
  
      // PART 1: Fix node position on drag end
      myChart.on('mouseup', function (params) {
        if (
          params.componentType === 'series' &&
          params.seriesType === 'graph' &&
          params.dataType === 'node' &&
          params.data && typeof params.data.id !== 'undefined' // Ensure params.data and its id exist
        ) {
          // Find the node in our current ECharts option data array by its id
          const nodeInOption = option.series[0].data.find(n => n.id === params.data.id);
  
          if (nodeInOption) {
              // Mark the node as fixed so the force layout no longer affects it
              nodeInOption.fixed = true; 
              
              // Capture the node's current x and y position after being dragged.
              // params.data from the event contains the node's state, including its position.
              if (typeof params.data.x === 'number' && typeof params.data.y === 'number') {
                  nodeInOption.x = params.data.x; 
                  nodeInOption.y = params.data.y;
                  console.log(`Node '${nodeInOption.name}' (ID: ${nodeInOption.id}) fixed at (x: ${nodeInOption.x.toFixed(2)}, y: ${nodeInOption.y.toFixed(2)}).`);
              } else {
                  console.warn(`Node '${nodeInOption.name}' (ID: ${nodeInOption.id}) fixed, but x/y coordinates were not available in event params.data. The node will be fixed at its current layout position.`);
              }
              
              // Update the chart with the modified node data.
              // This tells ECharts to respect the new 'fixed' state and 'x', 'y' coordinates.
              // The 'option' object has been directly mutated, so passing it to setOption
              // will apply all changes. ECharts will diff and update efficiently.
              myChart.setOption(option); 
          } else {
              console.warn("mouseup on node: Node not found in option.series[0].data. Event data ID:", params.data.id);
          }
        }
      });
  
  
      // PART 2: Toggle extra "resource" nodes on double-click
      myChart.on('dblclick', function (params) {
        if (
          params.componentType === 'series' &&
          params.seriesType === 'graph' &&
          params.dataType === 'node'
        ) {
          const clickedNodeId = params.data.id;
          const currentNodes = option.series[0].data;
          const currentLinks = option.series[0].links;
  
          // Find the clicked node in the option.series[0].data array
          let clickedNode = currentNodes.find(n => n.id === clickedNodeId);
  
          if (!clickedNode) {
              console.error("Clicked node not found in options data:", clickedNodeId);
              return;
          }
  
          const resourcePrefix = clickedNode.id + '_Resource_';
  
          if (!clickedNode.expanded) {
            var resourceColor = getRandomColor();
            var resourceNodes = [];
            var resourceLinks = [];
            var resourceCount = 2; // Adjust as desired.
  
            for (var i = 1; i <= resourceCount; i++) {
              var resourceId = resourcePrefix + i;
              var resourceDisplayName = clickedNode.name.split(' (')[0] + '_Resource ' + i;
              resourceNodes.push({
                id: resourceId,
                name: resourceDisplayName,
                // x: clickedNode.x ? clickedNode.x + i * 50 : undefined, // ECharts handles position
                // y: clickedNode.y ? clickedNode.y + i * 50 : undefined,
                fixed: false,
                expanded: false,
                isResource: true, // Custom flag
                category: 'Resource', // Assign a category for styling if needed
                itemStyle: {
                  color: resourceColor
                }
              });
              resourceLinks.push({
                source: clickedNode.id,
                target: resourceId,
                label: { show: true, text: 'has_resource' },
                lineStyle: { curveness: 0.1 }
              });
            }
            clickedNode.expanded = true;
  
            option.series[0].data = currentNodes.concat(resourceNodes);
            option.series[0].links = currentLinks.concat(resourceLinks);
            
            // Ensure 'Resource' category exists if not already
            let categories = option.series[0].categories;
            if (!categories.find(cat => cat.name === 'Resource')) {
                categories.push({ name: 'Resource', itemStyle: { color: getRandomColor() } });
                option.legend.data = categories.map(c => c.name);
            }
  
          } else {
            // Remove resource nodes and links
            option.series[0].data = currentNodes.filter(node => {
              return !(node.isResource && node.id.startsWith(resourcePrefix));
            });
            option.series[0].links = currentLinks.filter(link => {
              return !( (typeof link.target === 'string' && link.target.startsWith(resourcePrefix)) ||
                        (typeof link.source === 'string' && link.source.startsWith(resourcePrefix)) );
            });
            clickedNode.expanded = false;
          }
          myChart.setOption(option);
        }
      });
      console.log("Event handlers registered.");
  }
  
  // The loadAndVisualizeGraph() and registerEventHandlers() functions
  // will be called from the HTML file, after myChart is initialized.
  
