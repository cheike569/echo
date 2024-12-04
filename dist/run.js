import fg from 'fast-glob';
import path from 'path';
import { fileURLToPath } from 'url';
const __filename = fileURLToPath(import.meta.url); // get the resolved path to the file
const __dirname = path.dirname(__filename); // get the name of the directory
let testTimeout = Number(process.env.TEST_TIMEOUT_MS) || 15 * 60 * 1000;
let testTimeoutFunction;
// Parse command-line arguments
const args = process.argv.slice(2);
const onlyParam = args.find(arg => arg.startsWith('--only='));
const onlyFile = onlyParam ? onlyParam.split('=')[1] : null;
// Clean up recordings directory
import fs from 'fs';
import { promisify } from 'util';
import chalk from "chalk";
const readdir = promisify(fs.readdir);
const unlink = promisify(fs.unlink);
const recordingsDir = path.resolve(process.cwd(), 'recordings');
const files = await readdir(recordingsDir);
for (const file of files) {
    await unlink(path.resolve(recordingsDir, file));
}
// Load all the test files
async function getFiles() {
    let files = await fg(path.resolve(process.cwd(), 'tests/**/*.test.js'));
    // Filter files if only parameter is provided
    if (onlyFile) {
        files = files.filter(file => file.includes(onlyFile));
    }
    for (const file of files) {
        testTimeoutFunction = setTimeout(() => {
            process.exit(1);
        }, testTimeout);
        console.log(chalk.white.bgBlue.bold(`Running test: ${file}`));
        try {
            await import(path.resolve(file));
        }
        catch (e) {
            console.error(chalk.white.bgRed.bold(`Error in test: ${file}`));
            console.error(e);
        }
        clearTimeout(testTimeoutFunction);
        await new Promise((resolve) => setTimeout(resolve, 2000)); // Give the system time to spin up another ngrok.
    }
}
await getFiles();
process.exit();
//# sourceMappingURL=run.js.map