// Плавный скролл (Lenis)
try { 
    const lenis = new Lenis({duration: 1.2, smooth: true}); 
    function raf(t){ lenis.raf(t); requestAnimationFrame(raf); } 
    requestAnimationFrame(raf); 
} catch(e) {
    console.log("Lenis init failed", e);
}

// Кастомный курсор
const cursor = document.getElementById('cursor');
if (cursor) {
    window.addEventListener('mousemove', e => {
        document.body.classList.add('custom-cursor-active');
        if(typeof gsap !== 'undefined') {
            gsap.to(cursor, {x: e.clientX, y: e.clientY, duration: 0.1});
        }
    });

    // Эффекты наведения
    const interactives = document.querySelectorAll('a, button, .service-item, .term-item, .blog-item');
    interactives.forEach(el => {
        el.addEventListener('mouseenter', () => gsap.to(cursor, {scale: 3, duration: 0.3}));
        el.addEventListener('mouseleave', () => gsap.to(cursor, {scale: 1, duration: 0.3}));
    });
}