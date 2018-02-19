import { ascending, min, sum } from "d3-array";
import { map, nest } from "d3-collection";
import { justify } from "./align";
import constant from "./constant";

function ascendingSourceBreadth(a, b) {
  return ascendingBreadth(a.source, b.source) || a.index - b.index;
}

function ascendingTargetBreadth(a, b) {
  return ascendingBreadth(a.target, b.target) || a.index - b.index;
}

function ascendingBreadth(a, b) {
  return a.y0 - b.y0;
}

function value(d) {
  return d.value;
}

function nodeCenter(node) {
  return (node.y0 + node.y1) / 2;
}

function weightedSource(link) {
  return nodeCenter(link.source) * link.value;
}

function weightedTarget(link) {
  return nodeCenter(link.target) * link.value;
}

function defaultId(d) {
  return d.index;
}

function defaultNodes(graph) {
  return graph.nodes;
}

function defaultLinks(graph) {
  return graph.links;
}

function find(nodeById, id) {
  var node = nodeById.get(id);
  if (!node) throw new Error("missing: " + id);
  return node;
}

export default function () {
  var x0 = 0, y0 = 0, x1 = 1, y1 = 1, // extent
    dx = 24, // nodeWidth
    py = 8, // nodePadding
    firstLevelNodePadding = 0,
    id = defaultId,
    align = justify,
    nodes = defaultNodes,
    links = defaultLinks,
    iterations = 32;

  function sankey() {
    var graph = { nodes: nodes.apply(null, arguments), links: links.apply(null, arguments) };

    setGeneratedIds(graph);  //added
    computeNodeLinks(graph);
    computeNodeValues(graph);
    computeNodeDepths(graph);
    computeNodeBreadths(graph, iterations);
    //setOrderedPositions(graph);  //added
    computeLinkBreadths(graph);
    recomputeLinkPosAndArrangeNodes(graph); // added
    return graph;
  }

  function setGeneratedIds(graph) {
    graph.nodes.forEach((d, i) => {
      d.generatedID = 'ID' + i;
    });
  }
  function recomputeLinkPosAndArrangeNodes(graph) {
    //Modify link start positions
    graph.links.forEach(l => {
      var linkHeight = Math.max(1, l.width);
      var nodeHeight = l.source.y1 - l.source.y0;
      var diff = l.sourcePos / l.source.value * nodeHeight + linkHeight / 2;
      l.y0 = l.source.y0 + diff;
    });

    //Store each link's target node proportions values incremental sum
    var targetNodeLinkProportions = {};
    graph.links.forEach(l => {
      if (!targetNodeLinkProportions[l.target.generatedID]) targetNodeLinkProportions[l.target.generatedID] = 0;
      targetNodeLinkProportions[l.target.generatedID] += l.value;
    });

    // Modify link's end positions
    graph.links.forEach(l => {
      var linkHeight = Math.max(1, l.width);
      var nodeHeight = l.target.y1 - l.target.y0;
      var diff = l.targetPos / targetNodeLinkProportions[l.target.generatedID] * nodeHeight + linkHeight / 2;
      l.y1 = l.target.y0 + diff;
    });


    //Store  ordering of nodes based on new link ordering
    graph.nodes.forEach(node => {
      var neighbourSourceLinks = node.sourceLinks
        .filter(sl => (sl.target.level - 1) == node.level)
        .$orderBy(d => d.y0);
      neighbourSourceLinks.forEach((sourceLink, i) => {
        sourceLink.target.orderNumber = i + 1;
      })
    });


    // Replace target node positions 
    // Replace target and source link positions based on ordered result
    graph.nodes.forEach(node => {
      var oneLevelConnectedNodes = node.sourceLinks
        .filter(sl => (sl.target.level - 1) == node.level)
        .map(d => d.target);
      var startNodeY = d3.min(oneLevelConnectedNodes, d => d.y0);
      oneLevelConnectedNodes.$orderBy(d => d.orderNumber);
      //Replace positions
      oneLevelConnectedNodes.forEach(d => {
        var height = d.y1 - d.y0;
        var change = startNodeY - d.y0;
        d.y0 = startNodeY;
        d.y1 = startNodeY + height;
        d.targetLinks.forEach(d => {
          d.y1 += change;
        })
        d.sourceLinks.forEach(d => {
          d.y0 += change;
        })
        startNodeY += (py + height);
      });
    })

    //Update first level node paddings
    var nodes = graph.nodes
      .filter(d => d.level == 1);
    var diff = 0;
    nodes.forEach((d, i) => {
      var posIncrease = i * (firstLevelNodePadding);
      var diff = 10;
      if (d.sourceLinks) {
        var link = d.sourceLinks.filter(s => s.target.level == 2)[0];
        if (link && link.target) {
          diff += (link.target.y0 - d.y0) - firstLevelNodePadding / 2;
        }
      }
      if (i < 3) {
        diff = 0;
      }
      d.sourceLinks.map(s => s.target)
        .forEach(t => {
          updatePosition(t, posIncrease - diff)
        })
      // Update child positions as well
      d.positionUpdated = true;
      d.y0 += posIncrease;
      d.y1 += posIncrease;
      d.sourceLinks.forEach(s => {
        s.y0 += posIncrease;
      });
    });

    function updatePosition(d, posIncrease) {
      if (d.positionUpdated) return;

      d.positionUpdated = true;
      d.y0 += posIncrease;
      d.y1 += posIncrease;
      d.sourceLinks.forEach(s => {
        s.y0 += posIncrease;
      });
      d.targetLinks.forEach(s => {
        s.y1 += posIncrease;
      });

      d.sourceLinks.map(s => s.target)
        .forEach(t => {
          updatePosition(t, posIncrease - diff)
        })

    }


  }

  // not needed if we not relax from right to left
  function setOrderedPositions(graph) {
    var startPos = 0;
    graph.nodes.filter(d => d.depth == 0)
      .forEach(n => {
        var height = n.y1 - n.y0;
        n.y0 = startPos;
        n.y1 = startPos + height;
        startPos = n.y1 + py; // node padding
      })
  }

  sankey.update = function (graph) {
    computeLinkBreadths(graph);
    return graph;
  };

  sankey.nodeId = function (_) {
    return arguments.length ? (id = typeof _ === "function" ? _ : constant(_), sankey) : id;
  };

  sankey.nodeAlign = function (_) {
    return arguments.length ? (align = typeof _ === "function" ? _ : constant(_), sankey) : align;
  };

  sankey.nodeWidth = function (_) {
    return arguments.length ? (dx = +_, sankey) : dx;
  };

  sankey.nodePadding = function (_) {
    return arguments.length ? (py = +_, sankey) : py;
  };

  sankey.firstLevelNodePadding = function (_) {
    return arguments.length ? (firstLevelNodePadding = +_, sankey) : firstLevelNodePadding;
  };

  sankey.nodes = function (_) {
    return arguments.length ? (nodes = typeof _ === "function" ? _ : constant(_), sankey) : nodes;
  };

  sankey.links = function (_) {
    return arguments.length ? (links = typeof _ === "function" ? _ : constant(_), sankey) : links;
  };

  sankey.size = function (_) {
    return arguments.length ? (x0 = y0 = 0, x1 = +_[0], y1 = +_[1], sankey) : [x1 - x0, y1 - y0];
  };

  sankey.extent = function (_) {
    return arguments.length ? (x0 = +_[0][0], x1 = +_[1][0], y0 = +_[0][1], y1 = +_[1][1], sankey) : [[x0, y0], [x1, y1]];
  };

  sankey.iterations = function (_) {
    return arguments.length ? (iterations = +_, sankey) : iterations;
  };

  // Populate the sourceLinks and targetLinks for each node.
  // Also, if the source and target are not objects, assume they are indices.
  function computeNodeLinks(graph) {
    graph.nodes.forEach(function (node, i) {
      node.index = i;
      node.sourceLinks = [];
      node.targetLinks = [];
    });
    var nodeById = map(graph.nodes, id);
    graph.links.forEach(function (link, i) {
      link.index = i;
      var source = link.source, target = link.target;
      if (typeof source !== "object") source = link.source = find(nodeById, source);
      if (typeof target !== "object") target = link.target = find(nodeById, target);
      source.sourceLinks.push(link);
      target.targetLinks.push(link);
    });
  }

  // Compute the value (size) of each node by summing the associated links.
  function computeNodeValues(graph) {
    graph.nodes.forEach(function (node) {
      node.value = Math.max(
        sum(node.sourceLinks, value),
        sum(node.targetLinks, value),
        typeof node.value !== 'undefined' ? node.value : 0
      );
    });
  }

  // Iteratively assign the depth (x-position) for each node.
  // Nodes are assigned the maximum depth of incoming neighbors plus one;
  // nodes with no incoming links are assigned depth zero, while
  // nodes with no outgoing links are assigned the maximum depth.
  function computeNodeDepths(graph) {
    var nodes, next, x;

    for (nodes = graph.nodes, next = [], x = 0; nodes.length; ++x, nodes = next, next = []) {
      nodes.forEach(function (node) {
        node.depth = x;
        node.sourceLinks.forEach(function (link) {
          if (next.indexOf(link.target) < 0) {
            next.push(link.target);
          }
        });
      });
    }

    for (nodes = graph.nodes, next = [], x = 0; nodes.length; ++x, nodes = next, next = []) {
      nodes.forEach(function (node) {
        node.height = x;
        node.targetLinks.forEach(function (link) {
          if (next.indexOf(link.source) < 0) {
            next.push(link.source);
          }
        });
      });
    }

    var kx = (x1 - x0 - dx) / (x - 1);
    graph.nodes.forEach(function (node) {
      node.x1 = (node.x0 = x0 + Math.max(0, Math.min(x - 1, Math.floor(align.call(null, node, x)))) * kx) + dx;
    });
  }

  function computeNodeBreadths(graph) {
    var columns = nest()
      .key(function (d) { return d.x0; })
      .sortKeys(ascending)
      .entries(graph.nodes)
      .map(function (d) { return d.values; });

    //
    initializeNodeBreadth();
    resolveCollisions();

    for (var alpha = 1, n = iterations; n > 0; --n) {
      //relaxRightToLeft(alpha *= 0.99);
      resolveCollisions();
      relaxLeftToRight(alpha);
      resolveCollisions();
    }

    function initializeNodeBreadth() {
      var ky = min(columns, function (nodes) {
        return (y1 - y0 - (nodes.length - 1) * py) / sum(nodes, value);
      });

      columns.forEach(function (nodes) {
        nodes.forEach(function (node, i) {
          node.y1 = (node.y0 = i) + node.value * ky;
        });
      });

      graph.links.forEach(function (link) {
        link.width = link.value * ky;
      });
    }

    function relaxLeftToRight(alpha) {
      columns.forEach(function (nodes) {
        nodes.forEach(function (node) {
          if (node.targetLinks.length) {
            var dy = (sum(node.targetLinks, weightedSource) / sum(node.targetLinks, value) - nodeCenter(node)) * alpha;
            node.y0 += dy, node.y1 += dy;
          }
        });
      });
    }

    function relaxRightToLeft(alpha) {
      columns.slice().reverse().forEach(function (nodes) {
        nodes.forEach(function (node) {
          if (node.sourceLinks.length) {
            var dy = (sum(node.sourceLinks, weightedTarget) / sum(node.sourceLinks, value) - nodeCenter(node)) * alpha;
            node.y0 += dy, node.y1 += dy;
          }
        });
      });
    }

    function resolveCollisions() {
      columns.forEach(function (nodes) {
        var node,
          dy,
          y = y0,
          n = nodes.length,
          i;

        // Push any overlapping nodes down.
        nodes.sort(ascendingBreadth);
        for (i = 0; i < n; ++i) {
          node = nodes[i];
          dy = y - node.y0;
          if (dy > 0) node.y0 += dy, node.y1 += dy;
          y = node.y1 + py;
        }

        // If the bottommost node goes outside the bounds, push it back up.
        dy = y - py - y1;
        if (dy > 0) {
          y = (node.y0 -= dy), node.y1 -= dy;

          // Push any overlapping nodes back up.
          for (i = n - 2; i >= 0; --i) {
            node = nodes[i];
            dy = node.y1 + py - y;
            if (dy > 0) node.y0 -= dy, node.y1 -= dy;
            y = node.y0;
          }
        }
      });
    }
  }

  function computeLinkBreadths(graph) {
    graph.nodes.forEach(function (node) {
      node.sourceLinks.sort(ascendingTargetBreadth);
      node.targetLinks.sort(ascendingSourceBreadth);
    });
    graph.nodes.forEach(function (node) {
      var y0 = node.y0, y1 = y0;
      node.sourceLinks.forEach(function (link) {
        link.y0 = y0 + link.width / 2, y0 += link.width;
      });
      node.targetLinks.forEach(function (link) {
        link.y1 = y1 + link.width / 2, y1 += link.width;
      });
    });
  }

  Array.prototype.$orderBy = function (func) {
    this.sort((a, b) => {
      var a = func(a);
      var b = func(b);
      if (typeof a === 'string' || a instanceof String) {
        return a.localeCompare(b);
      }
      return a - b;
    });
    return this;
  }

  return sankey;
}
