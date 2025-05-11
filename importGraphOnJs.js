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
          repulsion: 250,  // Increased
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
  async function loadAndVisualizeGraph() {
      if (typeof N3 === 'undefined') {
          console.error("N3.js library is not loaded. Please include it in your HTML.");
          return;
      }
      if (typeof myChart === 'undefined') {
          console.error("ECharts 'myChart' instance not found. Ensure it's initialized before calling this function.");
          return;
      }
  
      try {
          const response = await fetch('test.ttl'); // Path to your TTL file
          if (!response.ok) {
              throw new Error(`HTTP error! status: ${response.status} while fetching test.ttl`);
          }
          const ttlData = await response.text();
  
          const parser = new N3.Parser();
          const store = new N3.Store();
  
          parser.parse(ttlData, (error, quad, prefixes) => {
              if (quad) {
                  store.addQuad(quad);
              } else if (error) {
                  console.error("Error parsing TTL:", error);
                  // Provide feedback to the user on the page as well
                  document.getElementById('main').innerHTML = `<p style="color:red;">Error parsing TTL: ${error.message}. Please check console.</p>`;
              } else {
                  // Parsing finished, now transform data for ECharts
                  console.log("TTL parsing complete. Prefixes:", prefixes);
                  const { nodes, links } = transformRdfToEcharts(store, prefixes);
                  console.log("Transformed nodes:", nodes);
                  console.log("Transformed links:", links);
  
                  option.series[0].data = nodes;
                  option.series[0].links = links;
                  const categories = extractCategories(nodes);
                  option.series[0].categories = categories;
                  option.legend.data = categories.map(c => c.name);
  
                  myChart.setOption(option, true); // true to not merge with previous options
                  console.log("ECharts option set with new data.");
              }
          });
  
      } catch (error) {
          console.error("Failed to load or process graph data:", error);
          document.getElementById('main').innerHTML = `<p style="color:red;">Failed to load graph data: ${error.message}. Please check console.</p>`;
      }
  }
  
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
              nodes.push({
                  id: subjectId, // Use URI/blank node ID as ECharts ID
                  name: subjectId, // Initial name, might be updated by literal
                  category: guessCategory(quad.subject, store, prefixes, getTermName),
                  properties: {}, // To store literal properties
                  fixed: false,
                  expanded: false
              });
              nodeMap.set(subjectId, nodes[nodes.length - 1]);
          }
          const subjectNode = nodeMap.get(subjectId);
  
          if (quad.object.termType === 'NamedNode' || quad.object.termType === 'BlankNode') {
              if (!nodeMap.has(objectId)) {
                  nodes.push({
                      id: objectId,
                      name: objectId,
                      category: guessCategory(quad.object, store, prefixes, getTermName),
                      properties: {},
                      fixed: false,
                      expanded: false
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
              if (predicateId.endsWith(':hasName') || predicateId.endsWith('#label') || predicateId.endsWith('rdfs:label')) {
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
          params.dataType === 'node'
        ) {
          // Find the node in our current data array by its id
          const nodeInOption = option.series[0].data.find(n => n.id === params.data.id);
          if (nodeInOption) {
              nodeInOption.fixed = true; // Mark as fixed
              // Note: ECharts' force layout might override x,y.
              // To truly fix, you might also need to update x,y here from params.event.offsetX/Y
              // and ensure force layout respects 'fixed'.
              // For simplicity, just setting 'fixed: true' relies on ECharts behavior.
              console.log(`Node ${nodeInOption.name} fixed.`);
              // No need to call setOption here if only 'fixed' attribute is used by layout
              // However, if x/y were updated directly: myChart.setOption(option);
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
  