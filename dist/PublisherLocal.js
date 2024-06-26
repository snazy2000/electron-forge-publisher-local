"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = void 0;

require("source-map-support/register");

var _asyncOra = require("@electron-forge/async-ora");

var _fs = _interopRequireDefault(require("fs"));
var _crypto = _interopRequireDefault(require('crypto'));
var _yaml = _interopRequireDefault(require('js-yaml'));
var _path = _interopRequireDefault(require('path'));

var _publisherBase = _interopRequireDefault(require("@electron-forge/publisher-base"));

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function _defineProperty(obj, key, value) { if (key in obj) { Object.defineProperty(obj, key, { value: value, enumerable: true, configurable: true, writable: true }); } else { obj[key] = value; } return obj; }

class PublisherLocal extends _publisherBase.default {
  constructor(...args) {
    super(...args);

    _defineProperty(this, "name", 'local');
  }

  async publish({
    makeResults
  }) {
    const {
      config
    } = this;
    const perReleaseArtifacts = {};

    for (const makeResult of makeResults) {
      const release = makeResult.packageJSON.version;

      if (!perReleaseArtifacts[release]) {
        perReleaseArtifacts[release] = [];
      }

      perReleaseArtifacts[release].push(makeResult);
    }

    if (!(config.directory && typeof config.directory === 'string')) {
      throw new Error('In order to publish locally you must set the "directory" property in your Forge config.');
    }

    const releasesFilePrefix = typeof config.releasesFilePrefix == 'undefined' ? '' : config.releasesFilePrefix;

    for (const releaseName of Object.keys(perReleaseArtifacts)) {
      const artifacts = perReleaseArtifacts[releaseName];

      let copyPath = _path.default.join(config.directory, releaseName);
      await (0, _asyncOra.asyncOra)(`Copying to local publish directory: ${releaseName}`, async () => {
        if (!_fs.default.existsSync(copyPath)) {
          _fs.default.mkdirSync(copyPath);
        }
      });

      let ymlfiles = [];
      let copied = 0;
      await (0, _asyncOra.asyncOra)(`Copying artifacts [${copied}] to ${copyPath}`, async uploadSpinner => {
        const updateSpinner = () => {
          uploadSpinner.text = `Copying artifacts [${copied}] to ${copyPath}`;
        };

        const flatArtifacts = [];

        for (const artifact of artifacts) {
          flatArtifacts.push(...artifact.artifacts);
        }

        await Promise.all(flatArtifacts.map(async artifactPath => {
          const done = () => {
            copied += 1;
            updateSpinner();
          };

          const artifactName = _path.default.basename(artifactPath); // eslint-disable-next-line max-len

          if (artifactName == 'RELEASES') {
            await (0, _asyncOra.asyncOra)(`Writing RELEASES to ${config.directory}`, async () => {
              let releasesString = _fs.default.readFileSync(artifactPath, 'utf8');
              let releasesPathed = releasesString.split(/\r?\n/g).map(line => {
                let parts = line.split(/ /g);
                let version = parts[1].replace(/^.*\-(\d\.\d\.\d)\-.*$/, '$1');
                parts[1] = releasesFilePrefix + version + '/' + parts[1];
                return parts.join(' ');
              });
              _fs.default.writeFileSync(_path.default.join(config.directory, 'RELEASES'), releasesPathed.join("\n"), 'utf8');
            });
          }

          let sha512 = await (async (artifactPath) => {
            return new Promise((resolve, reject) => {
              const hash = _crypto.default.createHash('sha512');
              hash.on("error", reject).setEncoding('base64');
              _fs.default.createReadStream(artifactPath, {
                highWaterMark: 1024 * 1024
              }).on("error", reject).on("end", () => {
                hash.end();
                resolve(hash.read());
              }).pipe(hash, {
                end: false
              });
            });
          })(artifactPath);

          let artifactNewPath = _path.default.join(copyPath, artifactName);

          _fs.default.copyFileSync(artifactPath, artifactNewPath);

          var url = artifactNewPath.replace(/\\/g, '/');
          // Windows drive letter must be prefixed with a slash
          if (url[0] !== '/') {
            url = '/' + url;
          }

          ymlfiles.push({
            url: 'file://' + url,
            sha512: sha512,
            name: artifactName
          });

          return done();
        }));
      });

      await (0, _asyncOra.asyncOra)(`Writing latest.yml to both ${config.directory} and ${releaseName}`, async () => {
        let latestyml = _yaml.default.dump({
          version: releaseName,
          files: ymlfiles.map(file => ({
            ...file,
            url: `${config.releasesFilePrefix}${releaseName}/${encodeURIComponent(file.name)}`
          }))
        });
        _fs.default.writeFileSync(_path.default.join(config.directory, releaseName, 'latest.yml'), latestyml, 'utf8');
        _fs.default.writeFileSync(_path.default.join(config.directory, 'latest.yml'), latestyml, 'utf8');
      });
    }
  }

}

exports.default = PublisherLocal;