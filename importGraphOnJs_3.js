// ECharts and N3.js must be loaded via <script> tags in HTML first.
// The myChart variable will be initialized in the HTML file.

// Add stats display styles
const statsStyles = `
    .stats-container {
        position: absolute;
        bottom: 0;
        left: 0;
        right: 0;
        background: rgba(255, 255, 255, 0.95);
        border-radius: 8px 8px 0 0;
        padding: 12px;
        margin: 0;
        box-shadow: 0 -2px 8px rgba(0,0,0,0.1);
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
        z-index: 1000;
        backdrop-filter: blur(5px);
        border-top: 1px solid rgba(0,0,0,0.1);
    }
    .stats-row {
        display: flex;
        justify-content: space-between;
        margin-bottom: 8px;
    }
    .stats-row:last-child {
        margin-bottom: 0;
    }
    .stats-item {
        flex: 1;
        padding: 4px 8px;
        background: rgba(0,0,0,0.03);
        border-radius: 4px;
        margin: 0 4px;
        text-align: center;
    }
    .stats-label {
        color: #666;
        font-size: 0.9em;
        margin-right: 8px;
    }
    .stats-value {
        color: #333;
        font-weight: 500;
    }
    .stats-progress {
        color: #666;
        font-size: 0.85em;
        margin-left: 4px;
    }
`;

// Add styles to document
if (!document.getElementById('statsStyles')) {
    const styleSheet = document.createElement('style');
    styleSheet.id = 'statsStyles';
    styleSheet.textContent = statsStyles;
    document.head.appendChild(styleSheet);
}

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
        roam: true, // Enable built-in zoom/pan
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
          repulsion: 1200,  // Increased
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
    notif.style.opacity = '0.98';
    notif.style.transition = 'opacity 0.4s';
    area.appendChild(notif);
    setTimeout(() => {
        notif.style.opacity = '0';
        setTimeout(() => area.removeChild(notif), 400);
    }, duration);
}

// Configuration for progressive loading
const PROGRESSIVE_LOADING_CONFIG = {
    initialNodeLimit: 25,  // Number of nodes to show initially
    batchSize: 25,         // Number of nodes to load in each batch
    maxNodes: 500,        // Maximum number of nodes to show at once
    maxLinks: 1000         // Maximum number of links to show at once
};

// Make configuration globally accessible
window.PROGRESSIVE_LOADING_CONFIG = PROGRESSIVE_LOADING_CONFIG;

// Filter configuration
const FILTER_CONFIG = {
    searchTerm: '',
    selectedCategories: new Set(),
    maxDepth: Infinity,
    showOnlyConnected: false
};

// Store for original graph data
let originalGraphData = null;

// Add these UI elements to your HTML:
// <div id="filterControls" style="margin: 10px;">
//     <input type="text" id="searchInput" placeholder="Search nodes...">
//     <select id="categoryFilter" multiple>
//         <option value="all">All Categories</option>
//     </select>
//     <input type="number" id="depthFilter" min="1" value="1" placeholder="Max Depth">
//     <button id="applyFilters">Apply Filters</button>
//     <button id="loadMore">Load More</button>
// </div>

function initializeFilterControls() {
    const searchInput = document.getElementById('searchInput');
    const categoryFilter = document.getElementById('categoryFilter');
    const depthFilter = document.getElementById('depthFilter');
    const applyFiltersBtn = document.getElementById('applyFilters');
    const loadMoreBtn = document.getElementById('loadMore');

    if (!searchInput || !categoryFilter || !depthFilter || !applyFiltersBtn || !loadMoreBtn) {
        console.warn("Filter controls not found in HTML. Skipping initialization.");
        return;
    }

    // Initialize category filter options
    function updateCategoryOptions(categories) {
        categoryFilter.innerHTML = '<option value="all">All Categories</option>';
        categories.forEach(cat => {
            const option = document.createElement('option');
            option.value = cat;
            option.textContent = cat;
            categoryFilter.appendChild(option);
        });
    }

    // Search input handler
    searchInput.addEventListener('input', (e) => {
        FILTER_CONFIG.searchTerm = e.target.value.toLowerCase();
        applyFilters();
    });

    // Category filter handler
    categoryFilter.addEventListener('change', () => {
        FILTER_CONFIG.selectedCategories = new Set(
            Array.from(categoryFilter.selectedOptions).map(opt => opt.value)
        );
        applyFilters();
    });

    // Depth filter handler
    depthFilter.addEventListener('change', (e) => {
        FILTER_CONFIG.maxDepth = parseInt(e.target.value) || Infinity;
        applyFilters();
    });

    // Apply filters button handler
    applyFiltersBtn.addEventListener('click', applyFilters);

    // Load more button handler
    loadMoreBtn.addEventListener('click', loadMoreNodes);

    // Initial category options update
    if (option.series[0].categories) {
        updateCategoryOptions(option.series[0].categories.map(c => c.name));
    }
}

function applyFilters() {
    if (!originalGraphData) return;
    
    const currentNodes = originalGraphData.nodes;
    const currentLinks = originalGraphData.links;
    
    // Filter nodes based on search term and categories
    const filteredNodes = currentNodes.filter(node => {
        const matchesSearch = !FILTER_CONFIG.searchTerm || 
            node.name.toLowerCase().includes(FILTER_CONFIG.searchTerm) ||
            node.id.toLowerCase().includes(FILTER_CONFIG.searchTerm);
        
        const matchesCategory = FILTER_CONFIG.selectedCategories.size === 0 || 
            FILTER_CONFIG.selectedCategories.has('all') ||
            FILTER_CONFIG.selectedCategories.has(node.category);
        
        return matchesSearch && matchesCategory;
    }).slice(0, PROGRESSIVE_LOADING_CONFIG.maxNodes);

    // Filter links based on filtered nodes
    const filteredLinks = currentLinks.filter(link => {
        const sourceNode = filteredNodes.find(n => n.id === link.source);
        const targetNode = filteredNodes.find(n => n.id === link.target);
        return sourceNode && targetNode;
    }).slice(0, PROGRESSIVE_LOADING_CONFIG.maxLinks);

    // Update the graph with filtered data
    option.series[0].data = filteredNodes;
    option.series[0].links = filteredLinks;
    myChart.setOption(option);
    
    // Update node styles after filtering
    updateNodeStyles();
    
    // Update stats display
    updateStatsDisplay();
    
    // Update file info display
    const fileInfoDisplay = document.getElementById('fileInfoDisplay');
    if (fileInfoDisplay) {
        const originalText = fileInfoDisplay.textContent.split(' | ');
        const nodeInfo = originalText.find(t => t.includes('Nodes:'));
        if (nodeInfo) {
            const newText = originalText.map(t => 
                t === nodeInfo ? `Nodes: ${originalGraphData.nodes.length} (Showing: ${filteredNodes.length})` : t
            ).join(' | ');
            fileInfoDisplay.textContent = newText;
        }
    }
}

function loadMoreNodes() {
    if (!originalGraphData) return;
    
    const currentNodes = option.series[0].data;
    const currentLinks = option.series[0].links;
    
    // Calculate how many more nodes to load
    const nodesToLoad = Math.min(
        PROGRESSIVE_LOADING_CONFIG.batchSize,
        PROGRESSIVE_LOADING_CONFIG.maxNodes - currentNodes.length
    );
    
    if (nodesToLoad <= 0) {
        showNotification("Maximum node limit reached.", 'warning');
        return;
    }
    
    // Load next batch of nodes
    const newNodes = originalGraphData.nodes.slice(currentNodes.length, currentNodes.length + nodesToLoad);
    
    // Find links connected to new nodes
    const newLinks = originalGraphData.links.filter(link => {
        const sourceInNew = newNodes.some(n => n.id === link.source);
        const targetInNew = newNodes.some(n => n.id === link.target);
        const sourceInCurrent = currentNodes.some(n => n.id === link.source);
        const targetInCurrent = currentNodes.some(n => n.id === link.target);
        return (sourceInNew && targetInCurrent) || (sourceInCurrent && targetInNew);
    });
    
    // Update the graph
    option.series[0].data = [...currentNodes, ...newNodes];
    option.series[0].links = [...currentLinks, ...newLinks];
    myChart.setOption(option);
    
    // Update node styles after loading more nodes
    updateNodeStyles();
    
    // Update stats display
    updateStatsDisplay();
    
    // Update file info display
    const fileInfoDisplay = document.getElementById('fileInfoDisplay');
    if (fileInfoDisplay) {
        const originalText = fileInfoDisplay.textContent.split(' | ');
        const nodeInfo = originalText.find(t => t.includes('Nodes:'));
        if (nodeInfo) {
            const newText = originalText.map(t => 
                t === nodeInfo ? `Nodes: ${originalGraphData.nodes.length} (Showing: ${currentNodes.length + newNodes.length})` : t
            ).join(' | ');
            fileInfoDisplay.textContent = newText;
        }
    }
    
    showNotification(`Loaded ${newNodes.length} more nodes and ${newLinks.length} links.`, 'info');
}

// Add this new function before loadAndVisualizeGraph
function updateNodeStyles() {
    if (!option.series[0].data || !option.series[0].links) return;
    
    // Create a set of connected node IDs
    const connectedNodes = new Set();
    option.series[0].links.forEach(link => {
        connectedNodes.add(link.source);
        connectedNodes.add(link.target);
    });
    
    // Update node styles
    option.series[0].data.forEach(node => {
        if (!node.itemStyle) {
            node.itemStyle = {};
        }
        
        // If node has no connections, make it transparent
        if (!connectedNodes.has(node.id)) {
            node.itemStyle.opacity = 0.3;
            console.log(`Making node ${node.id} transparent`);
        } else {
            node.itemStyle.opacity = 1.0;
        }
    });
    
    // Update the chart
    myChart.setOption(option);
}

// Modify the loadAndVisualizeGraph function to call updateNodeStyles
async function loadAndVisualizeGraph() {
    // Hide the graph placeholder when visualizing the graph
    const graphPlaceholder = document.querySelector('.graph-placeholder');
    if (graphPlaceholder) {
        graphPlaceholder.style.display = 'none';
    }
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

        // --- Detect OWL type by prefix ---
        let graphType = 'Classes';
        if (/^[ \t]*(@prefix|prefix)[ \t]+/im.test(ttlData)) {
            graphType = 'OWL';
        }

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
                        // --- Show type in fileInfoDisplay ---
                        const fileInfoDisplay = document.getElementById('fileInfoDisplay');
                        if (fileInfoDisplay) fileInfoDisplay.textContent = `Type: ${file.type || 'unknown'} | Size: ${(file.size/1024).toFixed(1)} KB | Graph Type: ${graphType}`;
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
                        
                        // Store original data for progressive loading
                        originalGraphData = { nodes, links };
                        
                        // Initially load only a subset of nodes
                        const initialNodes = nodes.slice(0, PROGRESSIVE_LOADING_CONFIG.initialNodeLimit);
                        const initialLinks = links.filter(link => {
                            const sourceInInitial = initialNodes.some(n => n.id === link.source);
                            const targetInInitial = initialNodes.some(n => n.id === link.target);
                            return sourceInInitial && targetInInitial;
                        });
                        
                        option.series[0].data = initialNodes;
                        option.series[0].links = initialLinks;
                        const categories = extractCategories(initialNodes);
                        option.series[0].categories = categories;
                        option.legend.data = categories.map(c => c.name);
                        
                        myChart.setOption(option, true);
                        
                        // Update node styles after setting the initial data
                        updateNodeStyles();
                        
                        // Initialize filter controls
                        initializeFilterControls();
                        
                        // Update stats display
                        updateStatsDisplay();
                        
                        showNotification(`Loaded initial ${initialNodes.length} nodes and ${initialLinks.length} links. Use "Load More" to see more.`, 'success');
                        
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
    const helpButton = document.getElementById('helpButton');
    const helpModal = document.getElementById('helpModal');
    const closeHelpModal = document.getElementById('closeHelpModal');
    const movingBg = document.getElementById('movingBg');

    // Ensure stats container exists and is properly positioned
    let statsDisplay = document.getElementById('statsDisplay');
    if (!statsDisplay) {
        statsDisplay = document.createElement('div');
        statsDisplay.id = 'statsDisplay';
        if (chartDom) {
            chartDom.style.position = 'relative'; // Ensure parent has relative positioning
            chartDom.appendChild(statsDisplay);
        }
    }

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
    if (zoomInBtn) {
        zoomInBtn.addEventListener('click', () => {
            // Increase zoom by a factor (e.g., 1.2)
            option.series[0].zoom = (option.series[0].zoom || 1) * 1.2;
            myChart.setOption(option);
            showNotification(`Zoomed in. Current zoom: ${option.series[0].zoom.toFixed(2)}x`, 'info', 1500);
        });
    }
    if (zoomOutBtn) {
        zoomOutBtn.addEventListener('click', () => {
            // Decrease zoom by a factor (e.g., 1/1.2)
            option.series[0].zoom = (option.series[0].zoom || 1) / 1.2;
            myChart.setOption(option);
            showNotification(`Zoomed out. Current zoom: ${option.series[0].zoom.toFixed(2)}x`, 'info', 1500);
        });
    }
    if (resetZoomBtn) {
        resetZoomBtn.addEventListener('click', () => {
            if (myChart) myChart.dispatchAction({ type: 'restore' }); // Resets zoom and pan
            showNotification('Zoom and pan reset.', 'info');
        });
    }
    if (fitViewBtn) {
        fitViewBtn.addEventListener('click', () => {
            if (myChart) myChart.dispatchAction({ type: 'restore' }); // Resets zoom and pan
            myChart.resize(); // Also ensures the chart fits its container
            showNotification('Graph view fitted and zoom reset.', 'info');
        });
    }
    if (clearGraphBtn) {
        clearGraphBtn.addEventListener('click', () => {
            option.series[0].data = [];
            option.series[0].links = [];
            option.series[0].categories = [];
            option.legend.data = [];
            myChart.setOption(option, true);
            updateNodeStyles(); // Update styles after clearing
            showNotification('Graph cleared.', 'info');
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

    // Add legend selection change handler
    myChart.on('legendselectchanged', function(params) {
        // Update node visibility based on legend selection
        option.series[0].data.forEach(node => {
            const category = node.category;
            const isSelected = params.selected[category];
            if (node.itemStyle) {
                node.itemStyle.opacity = isSelected ? 1.0 : 0.1;
            } else {
                node.itemStyle = { opacity: isSelected ? 1.0 : 0.1 };
            }
        });
        
        // Update the chart
        myChart.setOption(option);
        
        // Update node styles to maintain consistency with connection-based visibility
        updateNodeStyles();
    });
});
  
  function transformRdfToEcharts(store, prefixes) {
      const nodes = [];
      const links = [];
      const nodeMap = new Map(); // To keep track of nodes and their array indices
      const connectedNodes = new Set(); // Track which nodes have connections
  
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
  
      // --- Pass 1: Collect predicates used as edges and edge labels ---
      const edgePredicates = new Set();
      const edgeLabels = {};
      const labelPredicates = ['rdfs:label', 'skos:prefLabel', 'go:hasName', '#label'];
      store.getQuads().forEach(quad => {
          // If object is a NamedNode or BlankNode, this is an edge triple
          if (quad.object.termType === 'NamedNode' || quad.object.termType === 'BlankNode') {
              edgePredicates.add(getTermName(quad.predicate));
          }
      });
      // Now collect edge labels for those predicates
      store.getQuads().forEach(quad => {
          const subjectId = getTermName(quad.subject);
          const predicateId = getTermName(quad.predicate);
          if (edgePredicates.has(subjectId) && labelPredicates.some(lp => predicateId.endsWith(lp)) && quad.object.termType === 'Literal') {
              edgeLabels[predicateId] = quad.object.value;
          }
      });
  
      // --- Pass 2: Build nodes and links ---
      store.getQuads().forEach(quad => {
          const subjectId = getTermName(quad.subject);
          const predicateId = getTermName(quad.predicate);
          const objectId = getTermName(quad.object);
  
          // Only create nodes for subjects and objects in edge triples
          if (quad.object.termType === 'NamedNode' || quad.object.termType === 'BlankNode') {
              // Mark both subject and object as connected nodes
              connectedNodes.add(subjectId);
              connectedNodes.add(objectId);
  
              // Add subject node if not already added
              if (!nodeMap.has(subjectId)) {
                  let nodeSymbol = undefined;
                  let nodeItemStyle = undefined;
                  let nodeSymbolSize = undefined;
                  if (typeof subjectId === 'string' && subjectId.startsWith('go:')) {
                      nodeSymbol = 'diamond';
                      nodeItemStyle = { color: '#FFA500' }; // Always orange for diamonds
                      nodeSymbolSize = 70; // Bigger size for diamonds
                  }
                  nodes.push({
                      id: subjectId,
                      name: subjectId,
                      category: guessCategory(quad.subject, store, prefixes, getTermName),
                      properties: {},
                      fixed: false,
                      expanded: false,
                      itemStyle: {
                          opacity: 1.0 // Default opacity for connected nodes
                      },
                      ...(nodeSymbol ? { symbol: nodeSymbol } : {}),
                      ...(nodeItemStyle ? { itemStyle: { ...nodeItemStyle, opacity: 1.0 } } : {}),
                      ...(nodeSymbolSize ? { symbolSize: nodeSymbolSize } : {})
                  });
                  nodeMap.set(subjectId, nodes[nodes.length - 1]);
              }
              // Add object node if not already added
              if (!nodeMap.has(objectId)) {
                  let nodeSymbol = undefined;
                  let nodeItemStyle = undefined;
                  let nodeSymbolSize = undefined;
                  if (typeof objectId === 'string' && objectId.startsWith('go:')) {
                      nodeSymbol = 'diamond';
                      nodeItemStyle = { color: '#FFA500' }; // Always orange for diamonds
                      nodeSymbolSize = 70; // Bigger size for diamonds
                  }
                  nodes.push({
                      id: objectId,
                      name: objectId,
                      category: guessCategory(quad.object, store, prefixes, getTermName),
                      properties: {},
                      fixed: false,
                      expanded: false,
                      itemStyle: {
                          opacity: 1.0 // Default opacity for connected nodes
                      },
                      ...(nodeSymbol ? { symbol: nodeSymbol } : {}),
                      ...(nodeItemStyle ? { itemStyle: { ...nodeItemStyle, opacity: 1.0 } } : {}),
                      ...(nodeSymbolSize ? { symbolSize: nodeSymbolSize } : {})
                  });
                  nodeMap.set(objectId, nodes[nodes.length - 1]);
              }
              // Use edge label if available, otherwise use predicateId
              let edgeLabel = edgeLabels[predicateId] || predicateId;
              links.push({
                  source: subjectId,
                  target: objectId,
                  label: { show: true, text: edgeLabel },
                  lineStyle: { curveness: Math.random() * 0.2 }
              });
          } else if (quad.object.termType === 'Literal') {
              // Only attach properties to nodes that exist (i.e., not predicates)
              if (nodeMap.has(subjectId)) {
                  const subjectNode = nodeMap.get(subjectId);
                  if (!subjectNode.properties) subjectNode.properties = {};
                  subjectNode.properties[predicateId] = objectId;
                  // If it's a common naming predicate, update the node's display name
                  if (predicateId.endsWith(':hasName') || predicateId.endsWith('#label') || predicateId.endsWith('rdfs:label')) {
                      subjectNode.name = objectId;
                  }
              }
          }
      });
      
      // Make isolated nodes transparent
      nodes.forEach(node => {
          if (!connectedNodes.has(node.id)) {
              if (!node.itemStyle) {
                  node.itemStyle = {};
              }
              node.itemStyle.opacity = 0.3; // Make isolated nodes transparent
              console.log(`Making node ${node.id} transparent as it has no connections`);
          }
      });
      
      // Post-process names if a display name was preferred but ID is different
      nodes.forEach(node => {
          if (node.name !== node.id && node.properties) {
              let potentialName = node.id;
              const namePredicates = ['rdfs:label', 'go:hasName', 'skos:prefLabel'];
              for(const p of namePredicates) {
                  if(node.properties[p]) {
                      potentialName = node.properties[p];
                      break;
                  }
              }
              if (node.name === node.id && potentialName !== node.id) {
                  node.name = `${potentialName} (${node.id.split('/').pop().split('#').pop()})`;
              } else {
                  node.name = node.name;
              }
          } else if (node.name === node.id) {
              node.name = node.id.split('/').pop().split('#').pop();
          }
      });
  
      return { nodes, links };
  }
  
  function guessCategory(term, store, prefixes, getTermNameFunc) {
      const typePredicate = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#type';
      const typeQuads = store.getQuads(term, typePredicate, null, null);
      if (typeQuads.length > 0) {
          // Get the type URI
          const typeUri = typeQuads[0].object.value;
          
          // Try to get the Farsi label for this type
          const labelQuads = store.getQuads(typeQuads[0].object, 'http://www.w3.org/2000/01/rdf-schema#label', null, null);
          if (labelQuads.length > 0) {
              // Use the Farsi label if available
              return labelQuads[0].object.value;
          }
          
          // Fallback to prefixed name if no label found
          let categoryName = getTermNameFunc(typeQuads[0].object);
          if (categoryName === typeUri && typeUri.includes('/')) categoryName = typeUri.substring(typeUri.lastIndexOf('/') + 1);
          if (categoryName === typeUri && typeUri.includes('#')) categoryName = typeUri.substring(typeUri.lastIndexOf('#') + 1);
          return categoryName;
      }
      return 'Classes'; // Default category
  }
  
  function extractCategories(nodes) {
      const categorySet = new Set();
      nodes.forEach(node => {
          if (node.category) categorySet.add(node.category);
          else categorySet.add('Classes');
      });
      return Array.from(categorySet).map(catName => ({ 
          name: catName, 
          itemStyle: { color: getRandomColor() } 
      }));
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
              updateNodeStyles(); // Update styles after node movement
          } else {
              console.warn("mouseup on node: Node not found in option.series[0].data. Event data ID:", params.data.id);
          }
        }
      });
  
  
      // PART 2: Load more nodes on double-click
      myChart.on('dblclick', function (params) {
        if (
          params.componentType === 'series' &&
          params.seriesType === 'graph' &&
          params.dataType === 'node'
        ) {
          // Load more nodes when double-clicking any node
          loadMoreNodes();
          
          // If the clicked node is not fixed, fix it at its current position
          const clickedNode = option.series[0].data.find(n => n.id === params.data.id);
          if (clickedNode && !clickedNode.fixed) {
              clickedNode.fixed = true;
              if (typeof params.data.x === 'number' && typeof params.data.y === 'number') {
                  clickedNode.x = params.data.x;
                  clickedNode.y = params.data.y;
              }
              myChart.setOption(option);
              updateNodeStyles(); // Update styles after node movement
          }
        }
      });
      console.log("Event handlers registered.");
  }
  
  // The loadAndVisualizeGraph() and registerEventHandlers() functions
  // will be called from the HTML file, after myChart is initialized.
  
function updateStatsDisplay() {
    const statsDisplay = document.getElementById('statsDisplay');
    if (!statsDisplay || !originalGraphData) return;

    const currentNodes = option.series[0].data;
    const currentLinks = option.series[0].links;
    const totalNodes = originalGraphData.nodes.length;
    const totalLinks = originalGraphData.links.length;
    
    // Calculate average degree
    const nodeDegrees = new Map();
    currentLinks.forEach(link => {
        nodeDegrees.set(link.source, (nodeDegrees.get(link.source) || 0) + 1);
        nodeDegrees.set(link.target, (nodeDegrees.get(link.target) || 0) + 1);
    });
    const avgDegree = currentNodes.length > 0 
        ? (Array.from(nodeDegrees.values()).reduce((a, b) => a + b, 0) / currentNodes.length).toFixed(2)
        : 0;

    // Calculate graph density
    const maxPossibleEdges = (currentNodes.length * (currentNodes.length - 1)) / 2;
    const density = maxPossibleEdges > 0 ? (currentLinks.length / maxPossibleEdges).toFixed(4) : 0;

    // Calculate loading progress
    const loadingProgress = totalNodes > 0 ? ((currentNodes.length / totalNodes) * 100).toFixed(1) : 0;

    // Get number of categories
    const numCategories = option.series[0].categories ? option.series[0].categories.length : 0;

    statsDisplay.innerHTML = `
        <div class="stats-container">
            <div class="stats-row">
                <div class="stats-item">
                    <span class="stats-label">Nodes:</span>
                    <span class="stats-value">${currentNodes.length} / ${totalNodes}</span>
                    <span class="stats-progress">(${loadingProgress}%)</span>
                </div>
                <div class="stats-item">
                    <span class="stats-label">Edges:</span>
                    <span class="stats-value">${currentLinks.length} / ${totalLinks}</span>
                </div>
            </div>
            <div class="stats-row">
                <div class="stats-item">
                    <span class="stats-label">Categories:</span>
                    <span class="stats-value">${numCategories}</span>
                </div>
            </div>
        </div>
    `;
}
  
