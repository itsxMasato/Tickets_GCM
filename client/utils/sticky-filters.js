/* Documentado por: Miguel Flores */
export const stickyHeaderStyles = `
  .filters-bar-sticky {
    position: sticky;
    top: 0;
    z-index: 10;
    background-color: white;
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.05);
  }
  
  .filters-bar-sticky.scrolled {
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
  }
`;

/**
 * Activa el comportamiento "sticky" en una barra de filtros: la fija al hacer scroll
 * y le agrega sombra extra cuando la página está desplazada.
 * @param {HTMLElement} filterBarElement - elemento de la barra de filtros a hacer sticky
 * @returns {void}
 */
export function enableStickyFilters(filterBarElement) {
  filterBarElement.classList.add('filters-bar-sticky');
  
  let lastScrollY = 0;
  
  window.addEventListener('scroll', () => {
    const scrollY = window.scrollY;
    
    if (scrollY > 0) {
      filterBarElement.classList.add('scrolled');
    } else {
      filterBarElement.classList.remove('scrolled');
    }
    
    lastScrollY = scrollY;
  });
}

/**
 * Revierte el comportamiento sticky aplicado por enableStickyFilters, quitando sus clases CSS.
 * @param {HTMLElement} filterBarElement - elemento de la barra de filtros a restaurar
 * @returns {void}
 */
export function disableStickyFilters(filterBarElement) {
  filterBarElement.classList.remove('filters-bar-sticky', 'scrolled');
}

