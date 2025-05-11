// Utility function: generate a random hex color.
function getRandomColor() {
  return '#' + Math.floor(Math.random() * 0xffffff).toString(16).padStart(6, '0');
}

// Base graph option with a limited set of nodes and links
var option = {
  title: {
    text: 'Dynamic & Styled Graph'
  },
  tooltip: {},
  animationDurationUpdate: 1500,
  animationEasingUpdate: 'quinticInOut',
  legend: {
    data: ['Category 1']
  },
  series: [
    {
      type: 'graph',
      layout: 'force',
      draggable: true,
      label: {
        show: true,
        position: 'right',
        formatter: '{b}'
      },
      // Set a default blue color for base nodes.
      itemStyle: {
        color: '#5470c6'
      },
      symbolSize: 50,
      edgeSymbol: ['circle', 'arrow'],
      edgeSymbolSize: [4, 10],
      // Global edge label config: all edges will display labels.
      edgeLabel: {
        show: true,
        formatter: function (params) {
          return params.data && params.data.label && params.data.label.text
            ? params.data.label.text
            : '';
        },
        fontSize: 20
      },
      force: {
        edgeLength: 200,
        repulsion: 200,
        gravity: 0.2
      },
      // Base nodes; each node starts with fixed false and not expanded.
      data: [
        { name: 'Node 1', x: 300, y: 300, fixed: false, expanded: false },
        { name: 'Node 2', x: 800, y: 300, fixed: false, expanded: false },
        { name: 'Node 3', x: 550, y: 100, fixed: false, expanded: false },
        { name: 'Node 4', x: 550, y: 500, fixed: false, expanded: false }
      ],
      // Base links between nodes. (Each link includes a label property—even if empty—to ensure label display.)
      links: [
        {
          source: 0,
          target: 1,
          symbolSize: [5, 20],
          label: { show: true, text: 'Link' },
          lineStyle: { width: 5, curveness: 0.2 }
        },
        {
          source: 'Node 2',
          target: 'Node 1',
          label: { show: true, text: 'Link' },
          lineStyle: { curveness: 0.2 }
        },
        { source: 'Node 1', target: 'Node 3', label: { show: true, text: 'Link' } },
        { source: 'Node 2', target: 'Node 3', label: { show: true, text: 'Link' } },
        { source: 'Node 2', target: 'Node 4', label: { show: true, text: 'Link' } },
        { source: 'Node 1', target: 'Node 4', label: { show: true, text: 'Link' } }
      ],
      lineStyle: {
        opacity: 0.9,
        width: 2,
        curveness: 0
      }
    }
  ]
};

// Render the chart with the initial configuration.
myChart.setOption(option);

// -------------------------------
// PART 1: Fix node position on drag end
// -------------------------------
myChart.on('mouseup', function (params) {
  if (
    params.componentType === 'series' &&
    params.seriesType === 'graph' &&
    params.dataType === 'node'
  ) {
    var nodeIndex = params.dataIndex;
    var nodeData = option.series[0].data[nodeIndex];
    // Mark as fixed.
    nodeData.fixed = true;
    // Update the graph.
    myChart.setOption(option);
  }
});

// -------------------------------
// PART 2: Toggle extra "resource" nodes on double-click
// -------------------------------
myChart.on('dblclick', function (params) {
  if (
    params.componentType === 'series' &&
    params.seriesType === 'graph' &&
    params.dataType === 'node'
  ) {
    var clickedNodeIndex = params.dataIndex;
    var currentData = option.series[0].data;
    var currentLinks = option.series[0].links;
    var clickedNode = currentData[clickedNodeIndex];

    if (!clickedNode.expanded) {
      // Generate one random color for all new resource nodes for this expansion.
      var resourceColor = getRandomColor();
      // Add extra resource nodes (for example, 2 resource nodes).
      var resourceNodes = [];
      var resourceLinks = [];
      var resourceCount = 2; // Adjust as desired.

      for (var i = 1; i <= resourceCount; i++) {
        var resourceName = clickedNode.name + '_Resource ' + i;
        resourceNodes.push({
          name: resourceName,
          x: clickedNode.x + i * 50,
          y: clickedNode.y + i * 50,
          fixed: false,
          isResource: true,
          // Apply the same random color to each resource node in this expansion.
          itemStyle: {
            color: resourceColor
          }
        });
        resourceLinks.push({
          source: clickedNode.name,
          target: resourceName,
          label: { show: true, text: 'Link' },
          lineStyle: { curveness: 0.1 }
        });
      }
      // Mark the clicked node as expanded.
      clickedNode.expanded = true;

      // Append new nodes and resource links.
      option.series[0].data = currentData.concat(resourceNodes);
      option.series[0].links = currentLinks.concat(resourceLinks);
    } else {
      // Remove resource nodes and links associated with this base node.
      option.series[0].data = currentData.filter(function (node) {
        return !(node.isResource && node.name.indexOf(clickedNode.name + '_Resource') === 0);
      });
      option.series[0].links = currentLinks.filter(function (link) {
        if (typeof link.target === 'string' && link.target.indexOf(clickedNode.name + '_Resource') === 0) {
          return false;
        }
        if (typeof link.source === 'string' && link.source.indexOf(clickedNode.name + '_Resource') === 0) {
          return false;
        }
        return true;
      });
      clickedNode.expanded = false;
    }
    // Apply updated configuration.
    myChart.setOption(option);
  }
});
