/**
 * Given a package name, return an absolute path on the filesystem where the
 * files for that package can be found.
 *
 * If the package name is an NPM package, and it is not available locally,
 * this command will run a remote fetch to NPM to get the tarball and unzip it.
 */
const { resolve } = require('path');
const os = require('os');
const tar = require('tar');
const fetch = require('node-fetch');
const pkgDir = require('pkg-dir');
const execa = require('execa');
const prettyLogger = require('../util/pretty-logger');

const templateAliases = {
    'venia-concept': {
        npm: '@magento/venia-concept',
        dir: resolve(__dirname, '../../../venia-concept')
    }
};

async function makeDirFromNpmPackage(packageName) {
    // maybe the package to use as a template is already an available module!
    try {
        return pkgDir.sync(require.resolve(packageName));
    } catch (e) {
        try {
            const path = pkgDir.sync(resolve(packageName));
            if (path) {
                return path;
            }
        } catch (e) {
            // okay, we need to download the package after all.
        }
    }
    const tempPackageDir = resolve(os.tmpdir(), packageName);
    // NPM extracts a tarball to './package'
    const packageRoot = resolve(tempPackageDir, 'package');
    let tarballUrl;
    try {
        prettyLogger.info(`Finding ${packageName} tarball on NPM`);
        tarballUrl = JSON.parse(
            execa.shellSync(`npm view --json ${packageName}`, {
                encoding: 'utf-8'
            }).stdout
        ).dist.tarball;
    } catch (e) {
        throw new Error(
            `Invalid template: could not get tarball url from npm: ${e.message}`
        );
    }

    let tarballStream;
    try {
        prettyLogger.info(`Downloading and unpacking ${tarballUrl}`);
        tarballStream = (await fetch(tarballUrl)).body;
    } catch (e) {
        throw new Error(
            `Invalid template: could not download tarball from NPM: ${
                e.message
            }`
        );
    }

    await fse.ensureDir(tempPackageDir);
    return new Promise((res, rej) => {
        const untarStream = tar.extract({
            cwd: tempPackageDir
        });
        tarballStream.pipe(untarStream);
        untarStream.on('finish', () => {
            prettyLogger.info(`Unpacked ${packageName}`);
            res(packageRoot);
        });
        untarStream.on('error', rej);
        tarballStream.on('error', rej);
    });
}

module.exports = async function findTemplateDir(templateName) {
    const template = templateAliases[templateName] || {
        npm: templateName,
        dir: templateName
    };
    try {
        await fse.readdir(template.dir);
        prettyLogger.info(`Found ${templateName} directory`);
        // if that succeeded, then...
        return template.dir;
    } catch (e) {
        return makeDirFromNpmPackage(template.npm);
    }
};
