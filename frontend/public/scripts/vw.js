(function setVw() {
    function update() { document.documentElement.style.setProperty('--vw', `${window.innerWidth * 0.01}px`); }
    update();
    window.addEventListener('resize', update);
})();