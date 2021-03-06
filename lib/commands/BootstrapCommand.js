"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = undefined;

var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();

var _FileSystemUtilities = require("../FileSystemUtilities");

var _FileSystemUtilities2 = _interopRequireDefault(_FileSystemUtilities);

var _NpmUtilities = require("../NpmUtilities");

var _NpmUtilities2 = _interopRequireDefault(_NpmUtilities);

var _PackageUtilities = require("../PackageUtilities");

var _PackageUtilities2 = _interopRequireDefault(_PackageUtilities);

var _Command2 = require("../Command");

var _Command3 = _interopRequireDefault(_Command2);

var _async = require("async");

var _async2 = _interopRequireDefault(_async);

var _lodash = require("lodash.find");

var _lodash2 = _interopRequireDefault(_lodash);

var _path = require("path");

var _path2 = _interopRequireDefault(_path);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function _defineProperty(obj, key, value) { if (key in obj) { Object.defineProperty(obj, key, { value: value, enumerable: true, configurable: true, writable: true }); } else { obj[key] = value; } return obj; }

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

function _possibleConstructorReturn(self, call) { if (!self) { throw new ReferenceError("this hasn't been initialised - super() hasn't been called"); } return call && (typeof call === "object" || typeof call === "function") ? call : self; }

function _inherits(subClass, superClass) { if (typeof superClass !== "function" && superClass !== null) { throw new TypeError("Super expression must either be null or a function, not " + typeof superClass); } subClass.prototype = Object.create(superClass && superClass.prototype, { constructor: { value: subClass, enumerable: false, writable: true, configurable: true } }); if (superClass) Object.setPrototypeOf ? Object.setPrototypeOf(subClass, superClass) : subClass.__proto__ = superClass; }

var BootstrapCommand = function (_Command) {
  _inherits(BootstrapCommand, _Command);

  function BootstrapCommand() {
    _classCallCheck(this, BootstrapCommand);

    return _possibleConstructorReturn(this, (BootstrapCommand.__proto__ || Object.getPrototypeOf(BootstrapCommand)).apply(this, arguments));
  }

  _createClass(BootstrapCommand, [{
    key: "initialize",
    value: function initialize(callback) {
      // Nothing to do...
      callback(null, true);
    }
  }, {
    key: "execute",
    value: function execute(callback) {
      var _this2 = this;

      this.bootstrapPackages(function (err) {
        if (err) {
          callback(err);
        } else {
          _this2.logger.success("Successfully bootstrapped " + _this2.filteredPackages.length + " packages.");
          callback(null, true);
        }
      });
    }

    /**
     * Bootstrap packages
     * @param {Function} callback
     */

  }, {
    key: "bootstrapPackages",
    value: function bootstrapPackages(callback) {
      var _this3 = this;

      this.filteredPackages = this.getPackages();
      this.filteredGraph = _PackageUtilities2.default.getPackageGraph(this.filteredPackages);
      this.logger.info("Bootstrapping " + this.filteredPackages.length + " packages");
      _async2.default.series([
      // install external dependencies
      function (cb) {
        return _this3.installExternalDependencies(cb);
      },
      // symlink packages and their binaries
      function (cb) {
        return _this3.symlinkPackages(cb);
      },
      // prepublish bootstrapped packages
      function (cb) {
        return _this3.prepublishPackages(cb);
      }], callback);
    }

    /**
     * Get packages to bootstrap
     * @returns {Array.<Package>}
     */

  }, {
    key: "getPackages",
    value: function getPackages() {
      var ignore = this.flags.ignore || this.repository.bootstrapConfig.ignore;
      if (ignore) {
        this.logger.info("Ignoring packages that match '" + ignore + "'");
      }
      var filteredPackages = _PackageUtilities2.default.filterPackages(this.packages, ignore, true);
      return filteredPackages.concat(this.mainPackage);
    }

    /**
     * Run the "prepublish" NPM script in all bootstrapped packages
     * @param callback
     */

  }, {
    key: "prepublishPackages",
    value: function prepublishPackages(callback) {
      var _this4 = this;

      this.logger.info("Prepublishing packages");

      // Get a filtered list of packages that will be prepublished.
      var todoPackages = this.filteredPackages.slice();

      this.progressBar.init(todoPackages.length);

      // This maps package names to the number of packages that depend on them.
      // As packages are completed their names will be removed from this object.
      var pendingDeps = {};
      todoPackages.forEach(function (pkg) {
        return _this4.filteredGraph.get(pkg.name).dependencies.forEach(function (dep) {
          if (!pendingDeps[dep]) pendingDeps[dep] = 0;
          pendingDeps[dep]++;
        });
      });

      // Bootstrap runs the "prepublish" script in each package.  This script
      // may _use_ another package from the repo.  Therefore if a package in the
      // repo depends on another we need to bootstrap the dependency before the
      // dependent.  So the bootstrap proceeds in batches of packages where each
      // batch includes all packages that have no remaining un-bootstrapped
      // dependencies within the repo.
      var bootstrapBatch = function bootstrapBatch() {
        // Get all packages that have no remaining dependencies within the repo
        // that haven't yet been bootstrapped.
        var batch = todoPackages.filter(function (pkg) {
          var node = _this4.filteredGraph.get(pkg.name);
          return !node.dependencies.filter(function (dep) {
            return pendingDeps[dep];
          }).length;
        });

        // If we weren't able to find a package with no remaining dependencies,
        // then we've encountered a cycle in the dependency graph.  Run a
        // single-package batch with the package that has the most dependents.
        if (todoPackages.length && !batch.length) {
          _this4.logger.warn("Encountered a cycle in the dependency graph.  " + "This may cause instability if dependencies are used during `prepublish`.");
          batch.push(todoPackages.reduce(function (a, b) {
            return (pendingDeps[a.name] || 0) > (pendingDeps[b.name] || 0) ? a : b;
          }));
        }

        _async2.default.parallelLimit(batch.map(function (pkg) {
          return function (done) {
            pkg.runScript("prepublish", function (err) {
              _this4.progressBar.tick(pkg.name);
              delete pendingDeps[pkg.name];
              todoPackages.splice(todoPackages.indexOf(pkg), 1);
              done(err);
            });
          };
        }), _this4.concurrency, function (err) {
          if (todoPackages.length && !err) {
            bootstrapBatch();
          } else {
            _this4.progressBar.terminate();
            callback(err);
          }
        });
      };

      // Kick off the first batch.
      bootstrapBatch();
    }

    /**
     * Create a symlink to a dependency's binary in the node_modules/.bin folder
     * @param {String} src
     * @param {String} dest
     * @param {String} name
     * @param {String|Object} bin
     * @param {Function} callback
     */

  }, {
    key: "createBinaryLink",
    value: function createBinaryLink(src, dest, name, bin, callback) {
      var destBinFolder = _path2.default.join(dest, ".bin");
      // The `bin` in a package.json may be either a string or an object.
      // Normalize to an object.
      var bins = typeof bin === "string" ? _defineProperty({}, name, bin) : bin;
      var srcBinFiles = [];
      var destBinFiles = [];
      Object.keys(bins).forEach(function (name) {
        srcBinFiles.push(_path2.default.join(src, bins[name]));
        destBinFiles.push(_path2.default.join(destBinFolder, name));
      });
      // make sure when have a destination folder (node_modules/.bin)
      var actions = [function (cb) {
        return _FileSystemUtilities2.default.mkdirp(destBinFolder, cb);
      }];
      // symlink each binary
      srcBinFiles.forEach(function (binFile, idx) {
        actions.push(function (cb) {
          return _FileSystemUtilities2.default.symlink(binFile, destBinFiles[idx], "exec", cb);
        });
      });
      _async2.default.series(actions, callback);
    }

    /**
     * Install external dependencies for all packages
     * @param {Function} callback
     */

  }, {
    key: "installExternalDependencies",
    value: function installExternalDependencies(callback) {
      var _this5 = this;

      this.logger.info("Installing external dependencies");
      this.progressBar.init(this.filteredPackages.length);
      var actions = [];
      this.filteredPackages.forEach(function (pkg) {
        var allDependencies = pkg.allDependencies;
        var externalPackages = Object.keys(allDependencies).filter(function (dependency) {
          var match = (0, _lodash2.default)(_this5.packages, function (pkg) {
            return pkg.name === dependency;
          });
          return !(match && pkg.hasMatchingDependency(match));
        }).filter(function (dependency) {
          return !pkg.hasDependencyInstalled(dependency);
        }).map(function (dependency) {
          return dependency + "@" + allDependencies[dependency];
        });
        if (externalPackages.length) {
          actions.push(function (cb) {
            return _NpmUtilities2.default.installInDir(pkg.location, externalPackages, function (err) {
              _this5.progressBar.tick(pkg.name);
              cb(err);
            });
          });
        }
      });
      _async2.default.parallelLimit(actions, this.concurrency, function (err) {
        _this5.progressBar.terminate();
        callback(err);
      });
    }

    /**
     * Symlink all packages to the packages/node_modules directory
     * Symlink package binaries to dependent packages' node_modules/.bin directory
     * @param {Function} callback
     */

  }, {
    key: "symlinkPackages",
    value: function symlinkPackages(callback) {
      var _this6 = this;

      this.logger.info("Symlinking packages and binaries");
      this.progressBar.init(this.filteredPackages.length);
      var actions = [];
      this.filteredPackages.forEach(function (filteredPackage) {
        // actions to run for this package
        var packageActions = [];
        Object.keys(filteredPackage.allDependencies)
        // filter out external dependencies and incompatible packages
        .filter(function (dependency) {
          var match = _this6.packageGraph.get(dependency);
          return match && filteredPackage.hasMatchingDependency(match.package);
        }).forEach(function (dependency) {
          // get Package of dependency
          var dependencyPackage = _this6.packageGraph.get(dependency).package;
          // get path to dependency and its scope
          var dependencyLocation = dependencyPackage.location;

          var dependencyPackageJsonLocation = _path2.default.join(dependencyLocation, "package.json");
          // ignore dependencies without a package.json file
          if (!_FileSystemUtilities2.default.existsSync(dependencyPackageJsonLocation)) {
            _this6.logger.error("Unable to find package.json for " + dependency + " dependency of " + filteredPackage.name + ",  " + "Skipping...");
          } else {
            (function () {
              // get the destination directory name of the dependency
              var pkgDependencyLocation = _path2.default.join(filteredPackage.nodeModulesLocation, dependencyPackage.name);
              // check if dependency is already installed
              if (_FileSystemUtilities2.default.existsSync(pkgDependencyLocation)) {
                var isDepSymlink = _FileSystemUtilities2.default.isSymlink(pkgDependencyLocation);
                // installed dependency is a symlink pointing to a different location
                if (isDepSymlink !== false && isDepSymlink !== dependencyLocation) {
                  _this6.logger.warn("Symlink already exists for " + dependency + " dependency of " + filteredPackage.name + ", " + "but links to different location. Replacing with updated symlink...");
                  // installed dependency is not a symlink
                } else if (isDepSymlink === false) {
                  _this6.logger.warn(dependency + " is already installed for " + filteredPackage.name + ". " + "Replacing with symlink...");
                  // remove installed dependency
                  packageActions.push(function (cb) {
                    return _FileSystemUtilities2.default.rimraf(pkgDependencyLocation, cb);
                  });
                }
              }
              // ensure destination path
              packageActions.push(function (cb) {
                return _FileSystemUtilities2.default.mkdirp(pkgDependencyLocation.split(_path2.default.sep).slice(0, -1).join(_path2.default.sep), cb);
              });
              // create package symlink
              packageActions.push(function (cb) {
                return _FileSystemUtilities2.default.symlink(dependencyLocation, pkgDependencyLocation, "junction", cb);
              });
              var dependencyPackageJson = require(dependencyPackageJsonLocation);
              if (dependencyPackageJson.bin) {
                (function () {
                  var destFolder = filteredPackage.nodeModulesLocation;
                  packageActions.push(function (cb) {
                    _this6.createBinaryLink(dependencyLocation, destFolder, dependency, dependencyPackageJson.bin, cb);
                  });
                })();
              }
            })();
          }
        });
        actions.push(function (cb) {
          _async2.default.series(packageActions, function (err) {
            _this6.progressBar.tick(filteredPackage.name);
            cb(err);
          });
        });
      });
      _async2.default.series(actions, function (err) {
        _this6.progressBar.terminate();
        callback(err);
      });
    }
  }]);

  return BootstrapCommand;
}(_Command3.default);

exports.default = BootstrapCommand;
module.exports = exports["default"];