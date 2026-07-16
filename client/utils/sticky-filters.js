/**
 * Estilos CSS para hacer que un elemento sea "sticky" cuando se desplaza.
 * Se aplica a la barra de filtros en vistas de lista.
 */

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
 * Habilita el efecto sticky con detección de scroll.
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
 * Desactiva el efecto sticky.
 */
export function disableStickyFilters(filterBarElement) {
  filterBarElement.classList.remove('filters-bar-sticky', 'scrolled');
}
