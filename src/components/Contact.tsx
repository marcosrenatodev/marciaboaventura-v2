import { motion } from "framer-motion";
import { useInView } from "framer-motion";
import { useRef } from "react";
import { MessageCircle, Phone, MapPin, Clock, Mail } from "lucide-react";

const Contact = () => {
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true, margin: "-100px" });

  return (
    <section id="contato" className="py-24 bg-marsala-dark relative overflow-hidden">
      {/* Decorative Background */}
      <div className="absolute inset-0 opacity-10">
        <div className="absolute top-0 right-0 w-96 h-96 bg-gold rounded-full blur-3xl" />
        <div className="absolute bottom-0 left-0 w-96 h-96 bg-gold rounded-full blur-3xl" />
      </div>

      <div className="container mx-auto px-6 relative z-10">
        <div ref={ref} className="grid lg:grid-cols-2 gap-12 lg:gap-20 items-center">
          {/* Content */}
          <motion.div
            initial={{ opacity: 0, x: -50 }}
            animate={isInView ? { opacity: 1, x: 0 } : {}}
            transition={{ duration: 0.8 }}
          >
            <span className="text-gold font-medium text-sm tracking-widest uppercase mb-4 block">
              Contato
            </span>
            <h2 className="font-serif text-3xl md:text-4xl lg:text-5xl text-primary-foreground mb-6 leading-tight">
              Vamos conversar sobre o seu caso?
            </h2>

            <div className="section-divider mb-8" />

            <p className="text-primary-foreground/70 leading-relaxed mb-8">
              Entre em contato conosco para agendar uma consulta. Estamos prontos para 
              ouvir sua história e encontrar a melhor solução jurídica para você.
            </p>

            <div className="space-y-4 mb-8">
              <a
                href="https://wa.me/5541997085626"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-4 text-primary-foreground/80 hover:text-gold transition-colors duration-300"
              >
                <Phone className="w-5 h-5 text-gold" />
                <span>(41) 99708-5626</span>
              </a>
              <a
                href="mailto:contato@marciaboaventura.adv.br"
                className="flex items-center gap-4 text-primary-foreground/80 hover:text-gold transition-colors duration-300"
              >
                <Mail className="w-5 h-5 text-gold" />
                <span>contato@marciaboaventura.adv.br</span>
              </a>
              <div className="flex items-center gap-4 text-primary-foreground/80">
                <MapPin className="w-5 h-5 text-gold" />
                <span>Curitiba, PR</span>
              </div>
              <div className="flex items-center gap-4 text-primary-foreground/80">
                <Clock className="w-5 h-5 text-gold" />
                <span>Seg - Sex: 9h às 18h</span>
              </div>
            </div>

            <motion.a
              href="https://wa.me/5541997085626"
              target="_blank"
              rel="noopener noreferrer"
              initial={{ opacity: 0, y: 20 }}
              animate={isInView ? { opacity: 1, y: 0 } : {}}
              transition={{ duration: 0.6, delay: 0.4 }}
              className="inline-flex items-center gap-3 px-8 py-4 bg-gold hover:bg-gold-light text-dark font-semibold rounded transition-all duration-300 hover:shadow-xl hover:shadow-gold/30"
            >
              <MessageCircle className="w-5 h-5" />
              Falar pelo WhatsApp
            </motion.a>
          </motion.div>

          {/* CTA Card */}
          <motion.div
            initial={{ opacity: 0, x: 50 }}
            animate={isInView ? { opacity: 1, x: 0 } : {}}
            transition={{ duration: 0.8, delay: 0.2 }}
            className="glass-effect rounded-2xl p-8 md:p-10"
          >
            <div className="text-center">
              <div className="w-20 h-20 rounded-full bg-gold/20 flex items-center justify-center mx-auto mb-6">
                <MessageCircle className="w-10 h-10 text-gold" />
              </div>
              <h3 className="font-serif text-2xl text-primary-foreground mb-4">
                Atendimento Personalizado
              </h3>
              <p className="text-primary-foreground/70 mb-8 leading-relaxed">
                Cada cliente é único. Por isso, oferecemos um atendimento humanizado e 
                focado nas suas necessidades específicas. Agende uma consulta e tenha a 
                tranquilidade de contar com uma profissional dedicada.
              </p>

              <div className="space-y-4">
                <div className="flex items-center gap-3 text-primary-foreground/80">
                  <div className="w-2 h-2 rounded-full bg-gold" />
                  <span>Primeira consulta para análise do caso</span>
                </div>
                <div className="flex items-center gap-3 text-primary-foreground/80">
                  <div className="w-2 h-2 rounded-full bg-gold" />
                  <span>Atendimento online ou presencial</span>
                </div>
                <div className="flex items-center gap-3 text-primary-foreground/80">
                  <div className="w-2 h-2 rounded-full bg-gold" />
                  <span>Sigilo e confidencialidade garantidos</span>
                </div>
              </div>
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  );
};

export default Contact;
