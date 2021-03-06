import fs from "fs";
import path from "path";
import { Logger } from "/server/api";


/**
 * Synchronously check if a file or directory is empty or doesn't exist
 * @param {String} searchPath - path to file or directory
 * @return {Boolean} - returns true if file or directory isn't empty
 */
function isEmptyOrMissing(searchPath) {
  let stat;
  try {
    stat = fs.statSync(searchPath);
  } catch (e) {
    return true;
  }
  if (stat.isDirectory()) {
    const items = fs.readdirSync(searchPath);
    return !items || !items.length;
  }
  const file = fs.readFileSync(searchPath);
  return !file || !file.length;
}

// add a message to the top of the plugins import file
const importFileMessage = `
/**
 * ***** DO NOT EDIT THIS FILE MANUALLY *****
 * This file is generated automatically by the Reaction
 * plugin loader and will be reset at each startup.
 */

`;

/**
 * Dynamically create a plugin imports file on client or server
 * @param  {String} file - absolute path to file to write
 * @param  {Array} imports - array of import path strings
 * @return {Boolean} returns true if no error
 */
function generateImportsFile(file, imports) {
  // create/reset imports file
  try {
    Logger.info(`Resetting plugins file at ${file}`);
    fs.writeFileSync(file, "");
    fs.writeFileSync(file, importFileMessage);
  } catch (e) {
    Logger.error(e, `Failed to reset plugins file at ${file}`);
    throw new Meteor.Error(e);
  }

  // populate plugins file with imports
  imports.forEach((importPath) => {
    try {
      fs.appendFileSync(file, `import "${importPath}";\n`);
    } catch (e) {
      Logger.error(e, `Failed to write to plugins file at ${importPath}`);
      throw new Meteor.Error(e);
    }
  });
}


/**
 * Import Reaction plugins
 * @param {String} baseDirPath - path to a plugins sub-directory (core/included/custom)
 * @return {Object} - returns object with client and server keys that contain arrays
 */
function getImportPaths(baseDirPath) {
  // get an array of directories at a path
  const getDirectories = (dir) => {
    return fs.readdirSync(dir).filter((file) => {
      return fs.statSync(path.join(dir, file)).isDirectory();
    });
  };

  // get app root path
  const appRoot = path.resolve(".").split(".meteor")[0];

  // create the import path
  const getImportPath = (pluginFile) => {
    const importPath = "/" + path.relative(appRoot, pluginFile);
    return importPath.replace(/\\/g, "/");
  };

  // get all plugin directories at provided base path
  const pluginDirs = getDirectories(baseDirPath);

  const clientImportPaths = [];
  const serverImportPaths = [];
  const registryImportPaths = [];

  // read registry.json and require server/index.js if they exist
  pluginDirs.forEach((plugin) => {
    const clientImport = baseDirPath + plugin + "/client/index.js";
    const serverImport = baseDirPath + plugin + "/server/index.js";
    const registryImport = baseDirPath + plugin + "/register.js";

    // import the client files if they exist
    if (!isEmptyOrMissing(clientImport)) {
      Logger.info(`Client import found for ${plugin}`);
      clientImportPaths.push(getImportPath(clientImport.replace("/index.js", "")));
    }

    // import the server files if they exist
    if (!isEmptyOrMissing(serverImport)) {
      Logger.info(`Server import found for ${plugin}`);
      serverImportPaths.push(getImportPath(serverImport.replace("/index.js", "")));
    }

    // import plugin registry files
    if (!isEmptyOrMissing(registryImport)) {
      Logger.info(`Registry file found for ${plugin}`);
      registryImportPaths.push(getImportPath(registryImport));
    }
  });

  return {
    client: clientImportPaths,
    server: serverImportPaths,
    registry: registryImportPaths
  };
}


/**
 * Define base plugin paths
 */
const pluginsPath = path.resolve(".").split(".meteor")[0] + "imports/plugins/";
const corePlugins = pluginsPath + "core/";
const includedPlugins = pluginsPath + "included/";
const customPlugins = pluginsPath + "custom/";


export default function () {
  if (process.env.NODE_ENV !== "production" && !Meteor.isAppTest) {
    // get imports from each plugin directory
    const core = getImportPaths(corePlugins);
    const included = getImportPaths(includedPlugins);
    const custom = getImportPaths(customPlugins);

    // concat all imports
    const clientImports = [].concat(core.client, included.client, custom.client);
    const serverImports = [].concat(
      core.server,
      included.server,
      custom.server,
      core.registry,
      included.registry,
      custom.registry
    );

    const appRoot = path.resolve(".").split(".meteor")[0];

    // create import files on client and server and write import statements
    generateImportsFile(appRoot + "client/plugins.js", clientImports);
    generateImportsFile(appRoot + "server/plugins.js", serverImports);
  }
}
