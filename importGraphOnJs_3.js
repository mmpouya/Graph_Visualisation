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
            edgeLength: 200, // Might need adjustment
            repulsion: 1200, // Increased slightly, experiment with this
            gravity: 0.1,   // Experiment with this
            layoutAnimation: true // Default true, good to keep
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

async function loadAndVisualizeGraph() {
    if (typeof N3 === 'undefined') {
        console.error("N3.js library is not loaded.");
        alert("Critical Error: N3.js library is not loaded. Please ensure it's included in your HTML.");
        return;
    }
    if (typeof myChart === 'undefined' || !myChart) {
        console.error("ECharts 'myChart' instance not found.");
        alert("Critical Error: ECharts 'myChart' instance not found. Please ensure it's initialized.");
        return;
    }

    const fileInput = document.getElementById('fileInput');
    if (!fileInput || !fileInput.files || fileInput.files.length === 0) {
        console.warn("No file selected.");
        alert("Please select a TTL file first using the 'Choose File' button.");
        // Optionally, you might want to clear the chart if a user clicks load without a file
        // myChart.setOption({ series: [] }, true); // Clears the graph data
        return;
    }

    const file = fileInput.files[0];
    const reader = new FileReader();

    // Show loading animation on the chart
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
                if (parsingError) return; // If an error was already caught, stop further processing

                if (error) {
                    parsingError = error; // Store the error
                    console.error("Error during N3 parsing:", error);
                    // Don't alert yet, wait for the 'else' (end of stream) block
                    return;
                }

                if (quad) {
                    store.addQuad(quad);
                } else { // End of parsing (quad is null)
                    myChart.hideLoading(); // Parsing process (attempt) is finished

                    if (parsingError) {
                        alert(`Error parsing TTL file '${file.name}':\n${parsingError.message}\n\nCheck console for more details.`);
                        // Optionally clear the chart or show an error state
                        // option.series[0].data = []; option.series[0].links = []; myChart.setOption(option, true);
                        return; 
                    }

                    console.log(`TTL parsing complete for '${file.name}'. Prefixes:`, prefixes);
                    console.log("Total quads parsed:", store.size);

                    if (store.size === 0) {
                        alert(`The TTL file '${file.name}' is empty or does not contain any valid triples that could be visualized.`);
                        option.series[0].data = [];
                        option.series[0].links = [];
                        option.series[0].categories = [];
                        option.legend.data = [];
                        myChart.setOption(option, true); // Clear the chart
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
                        // alert(message); // Optional: user feedback on success

                        option.series[0].data = nodes;
                        option.series[0].links = links;
                        const categories = extractCategories(nodes);
                        option.series[0].categories = categories;
                        option.legend.data = categories.map(c => c.name);

                        myChart.setOption(option, true); // 'true' to clear previous graph data and components
                        console.log("ECharts option set with new data from", file.name);

                    } catch (transformError) {
                        myChart.hideLoading(); // Ensure loading is hidden
                        console.error("Error transforming RDF to ECharts data:", transformError);
                        alert(`Error processing graph data from '${file.name}':\n${transformError.message}`);
                    }
                }
            });
        } catch (e) { // Catch synchronous errors from N3.Parser instantiation or initial .parse call
            myChart.hideLoading();
            console.error("Synchronous error during parsing setup:", e);
            alert(`Critical error during TTL parsing setup for '${file.name}':\n${e.message}`);
        }
    };

    reader.onerror = function(error) {
        myChart.hideLoading();
        console.error("Error reading file:", error);
        alert(`Error reading file '${file.name}':\n${error.message}`);
    };

    reader.readAsText(file);
}

// --- Initialization logic (should be at the end of your script or in a DOMContentLoaded listener) ---
document.addEventListener('DOMContentLoaded', () => {
    const chartDom = document.getElementById('main');
    const fileInput = document.getElementById('fileInput');
    const loadButton = document.getElementById('loadButton');
    const fileNameDisplay = document.getElementById('fileNameDisplay');

    if (!chartDom) {
        console.error("ECharts container element with ID 'main' not found.");
        alert("Error: Chart container not found. Graph cannot be displayed.");
        return;
    }
    if (!fileInput || !loadButton || !fileNameDisplay) {
        console.error("Required HTML control elements (fileInput, loadButton, fileNameDisplay) not found.");
        alert("Error: Page control elements missing. File loading functionality may be impaired.");
        return;
    }
    
    // Ensure the global 'option' object is defined before initializing ECharts
    if (typeof option === 'undefined') {
        console.error("Global 'option' object for ECharts is not defined. Please define it.");
        alert("Configuration error: ECharts 'option' object is missing. Graph cannot be initialized.");
        // As a fallback, you might define a very basic option here to prevent errors,
        // but it's better to ensure 'option' is properly defined with your desired defaults.
        // window.option = { title: { text: 'Graph (Option Undefined)' }, series: [] };
        return;
    }

    myChart = echarts.init(chartDom);
    myChart.setOption(option); // Set initial options (e.g., empty graph with title)

    // Register event handlers for chart interactions (drag to fix, dblclick to expand)
    if (typeof registerEventHandlers === 'function') {
        registerEventHandlers();
    } else {
        console.warn("'registerEventHandlers' function is not defined. Chart interactions might not work.");
    }

    // Attach event listener to the load button
    loadButton.addEventListener('click', loadAndVisualizeGraph);

    // Update file name display when a file is chosen
    fileInput.addEventListener('change', () => {
        if (fileInput.files.length > 0) {
            fileNameDisplay.textContent = `Selected file: ${fileInput.files[0].name}`;
        } else {
            fileNameDisplay.textContent = 'No file selected.';
        }
    });

    console.log("Graph visualizer initialized. Ready to load TTL files.");
});
  
  function transformRdfToEcharts(store, prefixes) {
    const nodes = [];
    const links = [];
    const nodeMap = new Map(); // To keep track of nodes and their array indices

    // Helper to get a potentially prefixed name or full URI (already good)
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
        return term.value;
    }

    const GO_Y_POSITION = 150; // Y-coordinate for 'go' nodes (higher)
    const EX_Y_POSITION = 450; // Y-coordinate for 'ex' nodes (lower)
    const OTHER_Y_POSITION = 400; // Y-coordinate for other nodes (can be same as EX or distinct)
    const INITIAL_X_SPREAD = 800; // Spread for initial X positions

    store.getQuads().forEach(quad => {
        const subjectId = getTermName(quad.subject);
        const predicateId = getTermName(quad.predicate);
        const objectId = getTermName(quad.object);

        // --- Process Subject Node ---
        if (!nodeMap.has(subjectId)) {
            let nodeCategory;
            let initialY;
            let nodeSymbol = 'circle'; // Default symbol
            // Assign initial X to distribute nodes horizontally within their "field"
            let initialX = Math.random() * INITIAL_X_SPREAD;


            if (subjectId.startsWith('go:')) {
                nodeCategory = 'GO_Nodes';
                initialY = GO_Y_POSITION;
                nodeSymbol = 'diamond';
            } else if (subjectId.startsWith('ex:')) {
                nodeCategory = 'EX_Nodes';
                initialY = EX_Y_POSITION;
            } else {
                // Fallback to rdf:type based category or a default
                nodeCategory = guessCategory(quad.subject, store, prefixes, getTermName);
                // Place other nodes in the lower field by default, or assign a distinct Y
                initialY = (nodeCategory === 'Unknown') ? EX_Y_POSITION : OTHER_Y_POSITION;
            }

            nodes.push({
                id: subjectId,
                name: subjectId, // Initial name, might be updated by literal
                category: nodeCategory,
                properties: {},
                fixed: false,
                expanded: false,
                symbol: nodeSymbol, // Set based on prefix
                x: initialX,        // Set initial X for spread
                y: initialY         // Set initial Y for vertical grouping
            });
            nodeMap.set(subjectId, nodes[nodes.length - 1]);
        }
        const subjectNode = nodeMap.get(subjectId);

        // --- Process Object Node (if it's a node and not a literal) ---
        if (quad.object.termType === 'NamedNode' || quad.object.termType === 'BlankNode') {
            if (!nodeMap.has(objectId)) {
                let objectNodeCategory;
                let objectInitialY;
                let objectSymbol = 'circle';
                let objectInitialX = Math.random() * INITIAL_X_SPREAD;


                if (objectId.startsWith('go:')) {
                    objectNodeCategory = 'GO_Nodes';
                    objectInitialY = GO_Y_POSITION;
                    objectSymbol = 'diamond';
                } else if (objectId.startsWith('ex:')) {
                    objectNodeCategory = 'EX_Nodes';
                    objectInitialY = EX_Y_POSITION;
                } else {
                    objectNodeCategory = guessCategory(quad.object, store, prefixes, getTermName);
                    objectInitialY = (objectNodeCategory === 'Unknown') ? EX_Y_POSITION : OTHER_Y_POSITION;
                }

                nodes.push({
                    id: objectId,
                    name: objectId,
                    category: objectNodeCategory,
                    properties: {},
                    fixed: false,
                    expanded: false,
                    symbol: objectSymbol,
                    x: objectInitialX,
                    y: objectInitialY
                });
                nodeMap.set(objectId, nodes[nodes.length - 1]);
            }
            links.push({
                source: subjectId,
                target: objectId,
                label: { show: true, text: predicateId },
                lineStyle: { curveness: Math.random() * 0.1 } // Reduced from 0.2
            });
        } else if (quad.object.termType === 'Literal') {
            if (!subjectNode.properties) subjectNode.properties = {};
            subjectNode.properties[predicateId] = objectId;

            // Common naming predicates to update node's display name
            // Added skos:prefLabel, dc:title. Ensured consistent check.
            const namePredicates = ['rdfs:label', 'go:hasName', 'skos:prefLabel', 'dc:title', 'schema:name'];
            if (namePredicates.some(p => predicateId.toLowerCase().endsWith(p.toLowerCase()))) {
                 // Check if a prefix is used (e.g., "rdfs:label") or full URI
                const isPrefixedNamePredicate = namePredicates.some(p => predicateId === p || (prefixes[p.split(':')[0]] && predicateId === p));
                if (isPrefixedNamePredicate || namePredicates.some(p => quad.predicate.value.endsWith(p.split(':').pop()))) {
                   subjectNode.name = objectId;
                }
            }
        }
    });

    // Post-process names (refined for clarity)
    nodes.forEach(node => {
        let preferredNameFound = false;
        // Standard label properties, add more if needed (e.g., from schema.org, dc, etc.)
        const labelProperties = ['rdfs:label', 'go:hasName', 'skos:prefLabel', 'dc:title', 'schema:name'];
        if (node.properties) {
            for (const prop of labelProperties) {
                if (node.properties[prop]) {
                    node.name = node.properties[prop];
                    preferredNameFound = true;
                    break;
                }
            }
        }

        // If no common label property was found and the name is still the full ID, shorten it.
        if (!preferredNameFound && node.name === node.id) {
            let shortName = node.id.split('/').pop().split('#').pop();
            // If it's a prefixed name like "go:xxxx", that's already short enough
            if (!node.id.includes(':') || node.id.startsWith('http')) { // only shorten if not already a prefixed ID like ex:Type
                 node.name = shortName;
            }
        }
        // If a label was found AND it's different from the (potentially already shortened) ID,
        // you might want to display both: e.g., "Label (id_fragment)"
        // For now, the label property takes precedence if found.
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
        // Ensure every node has a category; default to 'Unknown' if somehow missed
        categorySet.add(node.category || 'Unknown');
    });

    const finalCategories = Array.from(categorySet).map(catName => {
        let itemStyle = {}; // Default empty itemStyle
        if (catName === 'GO_Nodes') {
            itemStyle.color = 'orange';
        } else if (catName === 'Resource') { // From your dblclick expansion
            itemStyle.color = '#67C23A'; // Example: A specific color for resources
        }
        else {
            itemStyle.color = getRandomColor(); // Random color for EX_Nodes and others
        }
        return { name: catName, itemStyle: itemStyle };
    });

    // Ensure 'Resource' category is present if it might be added dynamically
    // and not present in the initial nodes.
    if (finalCategories.every(cat => cat.name !== 'Resource')) {
        finalCategories.push({ name: 'Resource', itemStyle: { color: '#67C23A' } });
    }
     // Ensure 'EX_Nodes' category is present for the legend if no 'ex:' nodes were loaded
    if (finalCategories.every(cat => cat.name !== 'EX_Nodes')) {
        finalCategories.push({ name: 'EX_Nodes', itemStyle: { color: getRandomColor() } });
    }
    // Ensure 'GO_Nodes' category is present for the legend if no 'go:' nodes were loaded
    if (finalCategories.every(cat => cat.name !== 'GO_Nodes')) {
        finalCategories.push({ name: 'GO_Nodes', itemStyle: { color: 'orange' } });
    }


    return finalCategories;
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
