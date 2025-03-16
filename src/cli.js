#!/usr/bin/env node

import { program } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import path from 'path';
import fs from 'fs/promises';

async function* walkDirectory(dir) {
  const files = await fs.readdir(dir);
  for (const file of files) {
    const pathToFile = path.join(dir, file);
    const stat = await fs.stat(pathToFile);
    if (stat.isDirectory()) {
      yield* walkDirectory(pathToFile);
    } else if (/\.(jpg|jpeg|png|gif|svg|webp)$/i.test(file)) {
      yield pathToFile;
    }
  }
}

async function findImageReferences(emberDir, imagePath) {
  const references = [];
  const imageName = path.basename(imagePath);

  async function searchInFile(filePath) {
    try {
      const content = await fs.readFile(filePath, 'utf-8');
      if (content.includes(imageName)) {
        references.push(filePath);
      }
    } catch (error) {
      console.error(`Error reading file ${filePath}:`, error);
    }
  }

  async function* walkEmberFiles(dir) {
    const files = await fs.readdir(dir);
    for (const file of files) {
      const filePath = path.join(dir, file);
      const stat = await fs.stat(filePath);
      if (stat.isDirectory() && !file.startsWith('.')) {
        yield* walkEmberFiles(filePath);
      } else if (/\.(js|hbs|ts|scss|css)$/i.test(file)) {
        yield filePath;
      }
    }
  }

  for await (const filePath of walkEmberFiles(emberDir)) {
    await searchInFile(filePath);
  }

  return references;
}

async function analyzeImages(imageDir, emberDir, outputPath) {
  const spinner = ora('Analyzing images...').start();
  
  const results = {
    referenced: [],
    unreferenced: []
  };

  try {
    for await (const imagePath of walkDirectory(imageDir)) {
      const references = await findImageReferences(emberDir, imagePath);
      const relativePath = path.relative(imageDir, imagePath);
      
      if (references.length > 0) {
        results.referenced.push({
          path: relativePath,
          references: references.map(ref => path.relative(emberDir, ref))
        });
      } else {
        results.unreferenced.push({
          path: relativePath
        });
      }
    }

    await fs.writeFile(outputPath, JSON.stringify(results, null, 2));
    
    spinner.succeed('Analysis complete!');

    // Print summary
    console.log('\n' + chalk.bold('Analysis Summary:'));
    console.log(chalk.green(`✓ Referenced images: ${results.referenced.length}`));
    console.log(chalk.yellow(`! Unreferenced images: ${results.unreferenced.length}`));
    console.log(chalk.blue(`\nResults saved to: ${outputPath}`));

    // Print detailed results
    if (results.referenced.length > 0) {
      console.log('\n' + chalk.green.bold('Referenced Images:'));
      results.referenced.forEach(item => {
        console.log(chalk.green(`\n→ ${item.path}`));
        item.references.forEach(ref => {
          console.log(chalk.dim(`  Used in: ${ref}`));
        });
      });
    }

    if (results.unreferenced.length > 0) {
      console.log('\n' + chalk.yellow.bold('Unreferenced Images:'));
      results.unreferenced.forEach(item => {
        console.log(chalk.yellow(`→ ${item.path}`));
      });
    }

  } catch (error) {
    spinner.fail('Analysis failed');
    console.error(chalk.red('\nError:'), error.message);
    process.exit(1);
  }
}

program
  .name('analyze-images')
  .description('Analyze image usage in an Ember.js project')
  .version('1.0.0')
  .requiredOption('-i, --images <dir>', 'Directory containing images to analyze')
  .requiredOption('-p, --project <dir>', 'Ember.js project directory')
  .option('-o, --output <file>', 'Output JSON file path', 'image-analysis.json')
  .action(async (options) => {
    try {
      await analyzeImages(
        path.resolve(options.images),
        path.resolve(options.project),
        path.resolve(options.output)
      );
    } catch (error) {
      console.error(chalk.red('\nError:'), error.message);
      process.exit(1);
    }
  });

program.parse();