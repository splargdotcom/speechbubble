(function () {
  "use strict";

  const quote = (value) => JSON.stringify(value);

  function prepareScript(token) {
    return `try {
      if (!app.documents.length) throw "Open a document in Photopea first";
      var destination = -1;
      var currentName = app.activeDocument.name;
      var currentSource = app.activeDocument.source;
      for (var i = 0; i < app.documents.length; i++) {
        if (app.documents[i].name === currentName && app.documents[i].source === currentSource) {
          if (destination >= 0) throw "Give the active document a unique name before inserting";
          destination = i;
        }
      }
      if (destination < 0) throw "Could not identify the active document";
      app.echoToOE(${quote(token + ":ready:")} + JSON.stringify({ index: destination, count: app.documents.length, name: currentName, source: currentSource }));
    } catch (error) { app.echoToOE(${quote(token + ":error:")} + error.toString()); }`;
  }

  function openScript(dataUrl, token) {
    return `try { app.open(${quote(dataUrl)}, null, false); } catch (error) { app.echoToOE(${quote(token + ":error:")} + error.toString()); }`;
  }

  // A layer stroke follows the union's outside boundary. An SVG stroke would
  // also outline the hidden base of the tail and leave a seam across the body.
  function applyStroke(hex, width) {
    if (width <= 0) return;
    const descriptor = new ActionDescriptor();
    const reference = new ActionReference();
    reference.putProperty(charIDToTypeID("Prpr"), charIDToTypeID("Lefx"));
    reference.putEnumerated(charIDToTypeID("Lyr "), charIDToTypeID("Ordn"), charIDToTypeID("Trgt"));
    descriptor.putReference(charIDToTypeID("null"), reference);
    const effects = new ActionDescriptor();
    effects.putUnitDouble(charIDToTypeID("Scl "), charIDToTypeID("#Prc"), 100);
    const stroke = new ActionDescriptor();
    stroke.putBoolean(charIDToTypeID("enab"), true);
    stroke.putEnumerated(charIDToTypeID("Styl"), charIDToTypeID("FStl"), charIDToTypeID("CtrF"));
    stroke.putEnumerated(charIDToTypeID("PntT"), charIDToTypeID("FrFl"), charIDToTypeID("SClr"));
    stroke.putEnumerated(charIDToTypeID("Md  "), charIDToTypeID("BlnM"), charIDToTypeID("Nrml"));
    stroke.putUnitDouble(charIDToTypeID("Opct"), charIDToTypeID("#Prc"), 100);
    stroke.putUnitDouble(charIDToTypeID("Sz  "), charIDToTypeID("#Pxl"), width);
    const colour = new ActionDescriptor();
    colour.putDouble(charIDToTypeID("Rd  "), parseInt(hex.slice(1, 3), 16));
    colour.putDouble(charIDToTypeID("Grn "), parseInt(hex.slice(3, 5), 16));
    colour.putDouble(charIDToTypeID("Bl  "), parseInt(hex.slice(5, 7), 16));
    stroke.putObject(charIDToTypeID("Clr "), charIDToTypeID("RGBC"), colour);
    effects.putObject(charIDToTypeID("FrFX"), charIDToTypeID("FrFX"), stroke);
    descriptor.putObject(charIDToTypeID("T   "), charIDToTypeID("Lefx"), effects);
    executeAction(charIDToTypeID("setd"), descriptor, DialogModes.NO);
  }

  function shapeScript(data, destination, token) {
    return `${applyStroke.toString().replace(/\bconst\b/g, "var")}
    try {
      var shapeDocument = app.activeDocument;
      if (app.documents.length !== ${destination.count + 2} || shapeDocument.source !== ${quote(data.shapeUrl)}) throw "The Photopea document changed during insertion; the imported bubble has been left open";
      var textDocument = app.documents[${destination.count}];
      if (textDocument.source !== ${quote(data.dataUrl)}) throw "The bubble text document changed during insertion";
      var shape = shapeDocument.layers[0];
      if (shape.name !== "bubble-shape") throw "Photopea did not import the editable vector shape";
      shapeDocument.activeLayer = shape;
      applyStroke(${quote(data.stroke)}, ${data.strokeWidth});
      shape.opacity = ${data.opacity};
      shape.duplicate(textDocument, ElementPlacement.PLACEATEND);
      app.echoToOE(${quote(token + ":shaped")});
      shapeDocument.close(SaveOptions.DONOTSAVECHANGES);
    } catch (error) { app.echoToOE(${quote(token + ":error:")} + error.toString()); }`;
  }

  function finishScript(data, destination, token) {
    return `try {
      var imported = app.activeDocument;
      if (app.documents.length !== ${destination.count + 1} || imported.source !== ${quote(data.dataUrl)}) throw "The Photopea document changed during insertion; the imported bubble has been left open";
      var target = app.documents[${destination.index}];
      if (target.name !== ${quote(destination.name)} || target.source !== ${quote(destination.source)}) throw "The destination document changed during insertion";
      var shapeName = "";
      var hasText = false;
      for (var i = 0; i < imported.layers.length; i++) {
        var name = imported.layers[i].name;
        if (name === "bubble-shape" || name === "bubble-shape copy") shapeName = name;
        if (name === "bubble-text") hasText = true;
      }
      if (!shapeName) throw "Photopea did not import the editable bubble shape";
      imported.layers.getByName("bubble-preview").remove();
      imported.layers.getByName(shapeName).name = "bubble-shape";
      // Photopea adds groups beside the active layer. Select the root shape
      // first, or the new group can be created inside a nested text group.
      imported.activeLayer = imported.layers.getByName("bubble-shape");
      var group = imported.layerSets.add();
      group.name = ${quote(data.name)};
      imported.layers.getByName("bubble-shape").move(group, ElementPlacement.INSIDE);
      if (hasText) imported.layerSets.getByName("bubble-text").move(group, ElementPlacement.INSIDE);
      group.duplicate(target, ElementPlacement.PLACEATBEGINNING);
      app.echoToOE(${quote(token + ":inserted")});
      imported.close(SaveOptions.DONOTSAVECHANGES);
    } catch (error) { app.echoToOE(${quote(token + ":error:")} + error.toString()); }`;
  }

  window.SpeechbubblePhotopea = { prepareScript, openScript, shapeScript, finishScript };
}());
