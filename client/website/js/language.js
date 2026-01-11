// language.js - Language switching functionality

class LanguageSwitcher {
  constructor() {
    this.currentLang = localStorage.getItem('language') || 'en';
    this.translations = {};

    this.initialize();
  }

  async initialize() {
    await this.loadTranslations(this.currentLang);
    this.setupEventListeners();
    this.applyLanguage(this.currentLang);
    this.updateUI();
  }

  async loadTranslations(lang) {
    try {
      const response = await fetch(`lang/${lang}.json`);
      this.translations = await response.json();
    } catch (error) {
      console.error('Error loading translations:', error);
    }
  }

  setupEventListeners() {
    const langButtons = document.querySelectorAll('.lang-btn');

    langButtons.forEach(button => {
      button.addEventListener('click', async () => {
        const newLang = button.getAttribute('data-lang');
        if (newLang !== this.currentLang) {
          await this.switchLanguage(newLang);
        }
      });
    });
  }

  async switchLanguage(newLang) {
    // Save preference
    localStorage.setItem('language', newLang);

    // Update current language
    this.currentLang = newLang;

    // Load new translations
    await this.loadTranslations(newLang);

    // Apply language to all elements
    this.applyLanguage(newLang);

    // Update UI (buttons)
    this.updateUI();

    // Update HTML lang attribute
    document.documentElement.lang = newLang;

    // Reload lightpaper content if on lightpaper section
    this.reloadLightpaperContent();
  }

  applyLanguage(lang) {
    // Find all elements with data-lang attributes
    const elements = document.querySelectorAll('[data-lang-en]');

    elements.forEach(element => {
      const translation = element.getAttribute(`data-lang-${lang}`);
      if (translation) {
        element.textContent = translation;
      }
    });

    // Also update elements with nested content
    const nestedElements = document.querySelectorAll('[data-lang-en] span, [data-lang-en] p');
    nestedElements.forEach(element => {
      const translation = element.getAttribute(`data-lang-${lang}`);
      if (translation) {
        element.textContent = translation;
      }
    });
  }

  updateUI() {
    const langButtons = document.querySelectorAll('.lang-btn');

    langButtons.forEach(button => {
      const buttonLang = button.getAttribute('data-lang');
      if (buttonLang === this.currentLang) {
        button.classList.add('active');
      } else {
        button.classList.remove('active');
      }
    });
  }

  async reloadLightpaperContent() {
    const activeTab = document.querySelector('.paper-tab.active');
    if (activeTab) {
      const section = activeTab.getAttribute('data-section');
      await this.loadLightpaperSection(section);
    }
  }

  async loadLightpaperSection(section) {
    const contentContainer = document.getElementById('paper-content');
    if (!contentContainer) return;

    try {
      const response = await fetch(`lang/${this.currentLang}.json`);
      const data = await response.json();

      const sectionData = data.lightpaper[section];
      if (!sectionData) return;

      // Build HTML content
      let html = '';

      if (Array.isArray(sectionData.content)) {
        sectionData.content.forEach(paragraph => {
          const trimmed = paragraph.trim();

          if (trimmed === '') {
            html += '<br>';
          } else if (trimmed.startsWith('•')) {
            // Bullet point
            html += `<p>${paragraph}</p>`;
          } else if (trimmed.match(/^\d+\./)) {
            // Numbered list item
            html += `<p><strong>${paragraph}</strong></p>`;
          } else if (trimmed.endsWith(':')) {
            // Header
            html += `<h4>${paragraph}</h4>`;
          } else {
            // Regular paragraph
            html += `<p>${paragraph}</p>`;
          }
        });
      }

      contentContainer.innerHTML = html;
    } catch (error) {
      console.error('Error loading lightpaper content:', error);
    }
  }
}

// Initialize language switcher when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  new LanguageSwitcher();
});
