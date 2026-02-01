import { motion } from "framer-motion";
import { useInView } from "framer-motion";
import { useRef } from "react";
import marciaImg from "@/assets/marcia.jpg";

const About = () => {
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true, margin: "-100px" });

  return (
    <section id="sobre" className="py-24 bg-cream">
      <div className="container mx-auto px-6">
        <div ref={ref} className="grid lg:grid-cols-2 gap-12 lg:gap-20 items-center">
          {/* Image */}
          <motion.div
            initial={{ opacity: 0, x: -50 }}
            animate={isInView ? { opacity: 1, x: 0 } : {}}
            transition={{ duration: 0.8 }}
            className="relative"
          >
            <div className="relative">
              <img
                src={marciaImg}
                alt="Dra. Marcia Boaventura"
                className="w-full max-w-md mx-auto lg:mx-0 rounded-lg shadow-2xl"
              />
              {/* Decorative Frame */}
              <div className="absolute -bottom-4 -right-4 w-full h-full border-2 border-gold rounded-lg -z-10" />
            </div>
          </motion.div>

          {/* Content */}
          <motion.div
            initial={{ opacity: 0, x: 50 }}
            animate={isInView ? { opacity: 1, x: 0 } : {}}
            transition={{ duration: 0.8, delay: 0.2 }}
          >
            <span className="text-gold font-medium text-sm tracking-widest uppercase mb-4 block">
              Sobre
            </span>
            <h2 className="font-serif text-3xl md:text-4xl lg:text-5xl text-foreground mb-6 leading-tight">
              Compromisso, Dedicação e{" "}
              <span className="text-marsala">Excelência</span> na Advocacia
            </h2>

            <div className="section-divider mb-8" />

            <div className="space-y-4 text-muted-foreground leading-relaxed">
              <p>
                Atuo com uma advocacia <strong className="text-foreground">personalizada, estratégica e profundamente humanizada</strong>, 
                com foco nas áreas Cível, Família, Consumidor e Criminal.
              </p>
              <p>
                Acredito que cada cliente carrega uma história única — por isso, cada caso é tratado com 
                escuta ativa, visão estratégica e total dedicação. Com experiência e preparo técnico, 
                ofereço <strong className="text-foreground">soluções jurídicas seguras, ágeis e eficazes</strong>.
              </p>
              <p>
                Minha atuação é pautada na ética, no respeito e na busca incansável pelos seus direitos 
                e interesses. Mais do que resolver conflitos, meu objetivo é proporcionar a você 
                tranquilidade, proteção jurídica e clareza em cada etapa do processo.
              </p>
              <p className="text-marsala font-medium italic">
                "Se você busca alguém que trate sua causa com seriedade, comprometimento e sensibilidade, 
                estou pronta para te ajudar."
              </p>
            </div>

            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={isInView ? { opacity: 1, y: 0 } : {}}
              transition={{ duration: 0.6, delay: 0.5 }}
              className="mt-8"
            >
              <a
                href="https://wa.me/5541997085626"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 px-8 py-4 bg-marsala hover:bg-marsala-dark text-primary-foreground font-medium rounded transition-all duration-300 hover:shadow-xl hover:shadow-marsala/20"
              >
                Agende uma Consulta
              </a>
            </motion.div>
          </motion.div>
        </div>
      </div>
    </section>
  );
};

export default About;
