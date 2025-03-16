import { AnalysisResults } from './lib/analyzer';

export async function createMockFileSystem(): Promise<{
  imageDir: FileSystemDirectoryHandle;
  emberDir: FileSystemDirectoryHandle;
}> {
  const root = await navigator.storage.getDirectory();
  
  // Create image directory
  const imageDir = await root.getDirectoryHandle('images', { create: true });
  const mockImages = [
    { name: 'logo.svg', content: '<svg>Mock SVG content</svg>' },
    { name: 'hero.jpg', content: 'Mock JPG content' },
    { name: 'background.png', content: 'Mock PNG content' },
    { name: 'icon-menu.svg', content: '<svg>Mock menu icon</svg>' },
    { name: 'pattern.svg', content: '<svg>Mock pattern</svg>' },
    { name: 'unused1.webp', content: 'Mock WebP content' },
    { name: 'unused2.png', content: 'Mock unused PNG' },
    { name: 'unused3.jpg', content: 'Mock unused JPG' }
  ];

  for (const image of mockImages) {
    const fileHandle = await imageDir.getFileHandle(image.name, { create: true });
    const writable = await fileHandle.createWritable();
    await writable.write(image.content);
    await writable.close();
  }

  // Create Ember.js project directory
  const emberDir = await root.getDirectoryHandle('ember-project', { create: true });
  
  // Create app directory
  const appDir = await emberDir.getDirectoryHandle('app', { create: true });
  
  // Create templates directory
  const templatesDir = await appDir.getDirectoryHandle('templates', { create: true });
  
  // Create styles directory
  const stylesDir = await appDir.getDirectoryHandle('styles', { create: true });

  // Create and write template files
  const files = [
    {
      path: 'templates/index.hbs',
      content: `
<div class="hero">
  <img src="/images/hero.jpg" alt="Hero image">
  <div class="logo">
    <img src="/images/logo.svg" alt="Logo">
  </div>
  <button class="menu-button">
    <img src="images/icon-menu.svg" alt="Menu">
  </button>
</div>`
    },
    {
      path: 'templates/about.hbs',
      content: `
<div class="about-page">
  <div class="pattern-bg">
    <img src="pattern.svg" alt="Background pattern">
  </div>
</div>`
    },
    {
      path: 'styles/app.scss',
      content: `
.main-content {
  background-image: url('/images/background.png');
}
.secondary- content {
  background: url(background.png);
}`
    }
  ];

  // Write all files
  for (const file of files) {
    const parts = file.path.split('/');
    const filename = parts.pop()!;
    const dirPath = parts.join('/');
    
    // Get the correct directory handle
    let dirHandle = appDir;
    if (dirPath === 'templates') {
      dirHandle = templatesDir;
    } else if (dirPath === 'styles') {
      dirHandle = stylesDir;
    }
    
    const fileHandle = await dirHandle.getFileHandle(filename, { create: true });
    const writable = await fileHandle.createWritable();
    await writable.write(file.content.trim());
    await writable.close();
  }

  return { imageDir, emberDir };
}

// Sample results that match the mock file system
export const expectedResults: AnalysisResults = {
  referenced: [
    {
      path: 'hero.jpg',
      references: [
        {
          path: 'app/templates/index.hbs',
          line: 2,
          column: 18,
          context: '<img src="/images/hero.jpg" alt="Hero image">'
        }
      ]
    },
    {
      path: 'logo.svg',
      references: [
        {
          path: 'app/templates/index.hbs',
          line: 4,
          column: 18,
          context: '<img src="/images/logo.svg" alt="Logo">'
        }
      ]
    },
    {
      path: 'icon-menu.svg',
      references: [
        {
          path: 'app/templates/index.hbs',
          line: 7,
          column: 18,
          context: '<img src="images/icon-menu.svg" alt="Menu">'
        }
      ]
    },
    {
      path: 'pattern.svg',
      references: [
        {
          path: 'app/templates/about.hbs',
          line: 3,
          column: 18,
          context: '<img src="pattern.svg" alt="Background pattern">'
        }
      ]
    },
    {
      path: 'background.png',
      references: [
        {
          path: 'app/styles/app.scss',
          line: 2,
          column: 27,
          context: 'background-image: url(\'/images/background.png\');'
        },
        {
          path: 'app/styles/app.scss',
          line: 5,
          column: 19,
          context: 'background: url(background.png);'
        }
      ]
    }
  ],
  unreferenced: [
    { path: 'unused1.webp' },
    { path: 'unused2.png' },
    { path: 'unused3.jpg' }
  ],
  stats: {
    totalImages: 8,
    totalFiles: 3,
    duration: 100,
    excludedPaths: ['node_modules', '.git', 'dist', 'tmp', 'coverage'],
    includedPackages: [],
    searchedFiles: ['app/templates/index.hbs', 'app/templates/about.hbs', 'app/styles/app.scss']
  }
};