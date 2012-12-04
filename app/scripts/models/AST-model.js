(function (jQuery, _, Backbone, inventingOnPrinciple, esprima) {
  var insertHelpers = function (node, parent, chunks) {
    if (!node.range) return;

    node.parent = parent;

    node.source = function () {
      return chunks.slice(node.range[0], node.range[1]).join('');
    };

    node.update = function (s) {
      chunks[node.range[0]] = s;
      for (var i = node.range[0] + 1; i < node.range[1]; i++) {
        chunks[i] = '';
      }
    };
  };

  var traverse = function (ast, chunks, prefunc, postfunc) {
    var ctx = this;
    (function walk (node, parent) {
      postfunc && postfunc.call(ctx, node, parent, chunks);

      _.each(node, function (child, key) {
        if (key === 'parent' || key === 'range' || key === 'loc') return;

        if (_.isArray(child)) {
          _.each(child, function (grandchild) {
            if (grandchild && typeof grandchild.type === 'string') {
              walk(grandchild, node);
            }
          })
        } else if (child && typeof child.type === 'string') {
          postfunc && postfunc.call(ctx, child, node, chunks);
          walk(child, node);
        }
      });

      prefunc && prefunc.call(ctx, node, parent, chunks);
    })(ast, undefined);
  };

  inventingOnPrinciple.Models.ASTModel = Backbone.Model.extend({
    defaults: {
      parsingOptions: {
        // Range is required
        range: true,
        // comment: true,
        loc: true,
        raw: true,
        tokens: true
      },
    },
    initialize: function (attributes, options) {
      if (attributes && attributes.text) {
        this.setSource(attributes.text, options);
      }
      var vars = new inventingOnPrinciple.Collections.VariableCollection;

      this.set('vars', vars, { silent: true });
      var self = this;
      vars.on('change', function () {
        inventingOnPrinciple.updating = true;
        inventingOnPrinciple.codeEditor.setValue(self.toSource());
        inventingOnPrinciple.view.runCode();
        inventingOnPrinciple.updating = false;
      });
    },
    setSource: function (text, options) {
      if (typeof text !== 'string') {
        text = String(text);
      }

      var parsedResult = window.esprima.parse(text, this.get('parsingOptions'))
        , tokens= parsedResult.tokens
        , ast = _.omit(parsedResult, 'tokens')
        , chunks = text.split('');

      this.set({
        ast: ast,
        chunks: chunks,
        tokens: tokens
      }, options);

      this.posttraverse(insertHelpers);
      return this;
    },
    toSource: function () {
      return this.get('ast').source();
    },
    traverse: function (prefunc, postfunc) {
      var ast = this.get('ast')
        , chunks = this.get('chunks');

      if (ast && chunks) {
        traverse.call(this, ast, chunks, prefunc, postfunc);
      }
    },
    pretraverse: function (f) {
      this.traverse(f);
    },
    posttraverse: function (f) {
      this.traverse(null, f);
    },
    extractVars: function () {
      var prevVars = this.get('vars').toJSON()
        , vars = [];

      this.pretraverse(function (node) {
        if (node.type === 'VariableDeclaration') {
          var varModel = new inventingOnPrinciple.Models.VariableModel(node);
          vars.push(varModel);
        }
      });
      if (_.isEqual(prevVars, this.get('vars').toJSON())) {
        this.get('vars').reset(vars);
        this.trigger('change:vars', vars);
      }
    },
    onASTChange: function () {
      try {
        var generated = window.escodegen.generate(this.get('ast'));
        this.set({
          generatedCode: generated
        });
      } catch (e) {
        // console.log('gen Error', e);
      }
    }

  });

})(jQuery, _, Backbone, inventingOnPrinciple, esprima)
