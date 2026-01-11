// App.js - Main application logic

document.addEventListener('DOMContentLoaded', () => {
  initializeNavigation();
  initializeLightpaperTabs();
});

// Smooth scroll navigation
function initializeNavigation() {
  const navLinks = document.querySelectorAll('a[href^="#"]');

  navLinks.forEach(link => {
    link.addEventListener('click', (e) => {
      const href = link.getAttribute('href');
      if (href && href !== '#' && href.startsWith('#')) {
        e.preventDefault();
        const targetId = href.substring(1);
        const targetElement = document.getElementById(targetId);

        if (targetElement) {
          targetElement.scrollIntoView({
            behavior: 'smooth',
            block: 'start'
          });
        }
      }
    });
  });
}

// Lightpaper tab functionality
function initializeLightpaperTabs() {
  const tabs = document.querySelectorAll('.paper-tab');

  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      const section = tab.getAttribute('data-section');

      // Remove active class from all tabs
      tabs.forEach(t => t.classList.remove('active'));

      // Add active class to clicked tab
      tab.classList.add('active');

      // Load content for selected section
      loadLightpaperSection(section);
    });
  });

  // Load initial section
  const initialTab = document.querySelector('.paper-tab.active');
  if (initialTab) {
    const initialSection = initialTab.getAttribute('data-section');
    loadLightpaperSection(initialSection);
  }
}

// Load lightpaper section content from JSON
async function loadLightpaperSection(section) {
  const contentContainer = document.getElementById('paper-content');
  if (!contentContainer) return;

  const currentLang = document.documentElement.lang || 'en';

  try {
    const response = await fetch(`lang/${currentLang}.json`);
    const data = await response.json();

    const sectionData = data.lightpaper[section];
    if (!sectionData) return;

    // Build HTML content
    let html = `<h3>${sectionData.title}</h3>`;

    if (Array.isArray(sectionData.content)) {
      sectionData.content.forEach(paragraph => {
        if (paragraph.trim() === '') {
          html += '<br>';
        } else if (paragraph.startsWith('•')) {
          // Bullet point
          html += `<p>${paragraph}</p>`;
        } else if (paragraph.includes(':') && !paragraph.includes(' ')) {
          // Header-like content
          html += `<h4>${paragraph}</h4>`;
        } else {
          html += `<p>${paragraph}</p>`;
        }
      });
    } else {
      html += `<p>${sectionData.content}</p>`;
    }

    contentContainer.innerHTML = html;

    // Update paper sections
    const allSections = document.querySelectorAll('.paper-section');
    allSections.forEach(s => s.classList.remove('active'));

    // Add active class to current section
    let activeSection = document.querySelector(`.paper-section[data-section="${section}"]`);
    if (!activeSection) {
      activeSection = document.createElement('div');
      activeSection.className = 'paper-section active';
      activeSection.setAttribute('data-section', section);
      contentContainer.innerHTML = html;
    }
  } catch (error) {
    console.error('Error loading lightpaper content:', error);
  }
}
