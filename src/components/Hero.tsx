import { motion } from "framer-motion";
import { Instagram, MessageCircle, Mail, ChevronDown } from "lucide-react";
import heroBg from "@/assets/hero-bg.jpg";

const Hero = () => {
  return (
    <section
      id="inicio"
      className="relative min-h-screen flex items-center justify-center overflow-hidden"
    >
      {/* Background Image */}
      <div className="absolute inset-0">
        <img
          src={heroBg}
          alt="Escritório de Advocacia"
          className="w-full h-full object-cover"
        />
        <div className="hero-overlay absolute inset-0" />
      </div>

      {/* Content */}
      <div className="relative z-10 container mx-auto px-6 text-center">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.2 }}
          className="max-w-4xl mx-auto"
        >
          {/* Decorative Line */}
          <motion.div
            initial={{ scaleX: 0 }}
            animate={{ scaleX: 1 }}
            transition={{ duration: 1, delay: 0.5 }}
            className="section-divider mx-auto mb-8"
          />

          <h1 className="font-serif text-4xl sm:text-5xl md:text-6xl lg:text-7xl text-primary-foreground mb-6 leading-tight">
            Dra. Marcia{" "}
            <span className="text-gold-gradient">Boaventura</span>
          </h1>

          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.8, delay: 0.6 }}
            className="text-primary-foreground/80 text-lg md:text-xl mb-4 font-light tracking-wide"
          >
            Advogada OAB/PR nº 129.081
          </motion.p>

          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.8, delay: 0.8 }}
            className="flex flex-wrap justify-center gap-2 md:gap-4 text-gold text-sm md:text-base font-medium mb-12"
          >
            <span>Direito Civil</span>
            <span className="text-primary-foreground/40">•</span>
            <span>Direito do Consumidor</span>
            <span className="text-primary-foreground/40">•</span>
            <span>Direito Penal</span>
          </motion.div>

          {/* Social Icons */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 1 }}
            className="flex justify-center gap-4"
          >
            <a
              href="https://www.instagram.com/adv.marciaboaventura"
              target="_blank"
              rel="noopener noreferrer"
              className="w-14 h-14 rounded-full border-2 border-primary-foreground/30 flex items-center justify-center text-primary-foreground/80 hover:border-gold hover:text-gold transition-all duration-300 hover:scale-110"
              aria-label="Instagram"
            >
              <Instagram size={22} />
            </a>
            <a
              href="https://wa.me/5541997085626"
              target="_blank"
              rel="noopener noreferrer"
              className="w-14 h-14 rounded-full border-2 border-primary-foreground/30 flex items-center justify-center text-primary-foreground/80 hover:border-gold hover:text-gold transition-all duration-300 hover:scale-110"
              aria-label="WhatsApp"
            >
              <MessageCircle size={22} />
            </a>
            <a
              href="mailto:contato@marciaboaventura.adv.br"
              className="w-14 h-14 rounded-full border-2 border-primary-foreground/30 flex items-center justify-center text-primary-foreground/80 hover:border-gold hover:text-gold transition-all duration-300 hover:scale-110"
              aria-label="Email"
            >
              <Mail size={22} />
            </a>
          </motion.div>
        </motion.div>

      </div>
      {/* Scroll Indicator - fora do container de conteúdo */}
      <motion.a
        href="#sobre"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 1, delay: 1.5 }}
        className="absolute bottom-6 left-1/2 -translate-x-1/2 z-20 text-primary-foreground/60 hover:text-gold transition-colors duration-300"
      >
        <motion.div
          animate={{ y: [0, 10, 0] }}
          transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
        >
          <ChevronDown size={32} />
        </motion.div>
      </motion.a>
    </section>
  );
};

export default Hero;
