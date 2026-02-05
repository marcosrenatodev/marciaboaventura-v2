import { motion } from "framer-motion";
import { useInView } from "framer-motion";
import { useRef } from "react";
import { Star, Quote, MapPin, Phone, Mail, Clock, Scale, Award, Users } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

const reviews = [
  {
    name: "Mara Regina",
    rating: 5,
    text: "Indico com total segurança e eficiência a Dra Márcia. Atenciosa e competente. Me ajudou muito no meu caso, do início ao fim esclarecendo minhas dúvidas. Você estará bem representado pela Dr. Márcia Boaventura.",
    date: "4 meses atrás",
  },
  {
    name: "Alexandro Barros",
    rating: 5,
    text: "Doutora Márcia essa vai longe obrigada Pela dedicação no meu caso, tem Me ajudado muito. Super indico ✅",
    date: "5 meses atrás",
  },
  {
    name: "Janete de Fátima Guimarães Conceicao",
    rating: 5,
    text: "Uma excelente profissional, trabalhou com muita seriedade e competência. Recomendo.",
    date: "4 meses atrás",
  },
  {
    name: "Ivonete Mayer",
    rating: 5,
    text: "Tenho excelente experiência com a Dra Marcia profissional experiente e dedicada",
    date: "4 meses atrás",
  },
];

const stats = [
  // { icon: Users, value: "500+", label: "Clientes Atendidos" },
  // { icon: Scale, value: "10+", label: "Anos de Experiência" },
  // { icon: Award, value: "98%", label: "Casos de Sucesso" },
];

const Reviews = () => {
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true, margin: "-100px" });

  return (
    <section id="avaliacoes" className="py-24 bg-cream">
      <div className="container mx-auto px-6">
        <div ref={ref} className="text-center mb-16">
          <motion.span
            initial={{ opacity: 0, y: 20 }}
            animate={isInView ? { opacity: 1, y: 0 } : {}}
            transition={{ duration: 0.6 }}
            className="text-gold font-medium text-sm tracking-widest uppercase mb-4 block"
          >
            Avaliações
          </motion.span>
          <motion.h2
            initial={{ opacity: 0, y: 20 }}
            animate={isInView ? { opacity: 1, y: 0 } : {}}
            transition={{ duration: 0.6, delay: 0.1 }}
            className="font-serif text-3xl md:text-4xl lg:text-5xl text-foreground mb-4"
          >
            O que nossos <span className="text-marsala">clientes</span> dizem
          </motion.h2>
          <motion.div
            initial={{ opacity: 0, scaleX: 0 }}
            animate={isInView ? { opacity: 1, scaleX: 1 } : {}}
            transition={{ duration: 0.6, delay: 0.2 }}
            className="section-divider mx-auto mb-6"
          />

          {/* Google Rating Summary */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={isInView ? { opacity: 1, y: 0 } : {}}
            transition={{ duration: 0.6, delay: 0.3 }}
            className="flex items-center justify-center gap-2 mb-4"
          >
            <div className="flex gap-1">
              {[...Array(5)].map((_, i) => (
                <Star key={i} className="w-5 h-5 fill-gold text-gold" />
              ))}
            </div>
            <span className="text-foreground font-semibold text-lg">5.0</span>
            <span className="text-muted-foreground">no Google</span>
          </motion.div>
        </div>

        {/* Stats */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={isInView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.6, delay: 0.3 }}
          className="grid grid-cols-3 gap-6 mb-16 max-w-2xl mx-auto"
        >
          {stats.map((stat, index) => (
            <div key={index} className="text-center">
              <stat.icon className="w-8 h-8 text-gold mx-auto mb-2" />
              <p className="text-2xl md:text-3xl font-serif font-bold text-marsala">{stat.value}</p>
              <p className="text-sm text-muted-foreground">{stat.label}</p>
            </div>
          ))}
        </motion.div>

        {/* Reviews Grid */}
        <div className="grid md:grid-cols-2 gap-6 mb-16">
          {reviews.map((review, index) => (
            <motion.div
              key={index}
              initial={{ opacity: 0, y: 30 }}
              animate={isInView ? { opacity: 1, y: 0 } : {}}
              transition={{ duration: 0.6, delay: 0.4 + index * 0.1 }}
            >
              <Card className="card-elegant h-full border-none shadow-lg hover:shadow-xl transition-shadow duration-300">
                <CardContent className="p-6">
                  <Quote className="w-8 h-8 text-gold/30 mb-4" />
                  <div className="flex gap-1 mb-3">
                    {[...Array(review.rating)].map((_, i) => (
                      <Star key={i} className="w-4 h-4 fill-gold text-gold" />
                    ))}
                  </div>
                  <p className="text-muted-foreground leading-relaxed mb-4 italic">
                    "{review.text}"
                  </p>
                  <div className="flex items-center justify-between">
                    <p className="font-medium text-foreground">{review.name}</p>
                    <p className="text-sm text-muted-foreground">{review.date}</p>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </div>

        {/* Company Info */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={isInView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.6, delay: 0.8 }}
          className="bg-marsala-dark rounded-2xl p-8 md:p-10"
        >
          <div className="grid md:grid-cols-2 gap-8">
            <div>
              <h3 className="font-serif text-2xl text-primary-foreground mb-6">
                Informações do Escritório
              </h3>
              <div className="space-y-4">
                <div className="flex items-start gap-4">
                  <MapPin className="w-5 h-5 text-gold mt-1 shrink-0" />
                  <div>
                    <p className="text-primary-foreground font-medium">Localização</p>
                    <p className="text-primary-foreground/70">Curitiba, Paraná</p>
                    <p className="text-primary-foreground/60 text-sm">Atendimento em todo o Brasil</p>
                  </div>
                </div>
                <div className="flex items-start gap-4">
                  <Phone className="w-5 h-5 text-gold mt-1 shrink-0" />
                  <div>
                    <p className="text-primary-foreground font-medium">Telefone / WhatsApp</p>
                    <a
                      href="https://wa.me/5541997085626"
                      className="text-primary-foreground/70 hover:text-gold transition-colors"
                    >
                      (41) 99708-5626
                    </a>
                  </div>
                </div>
                <div className="flex items-start gap-4">
                  <Mail className="w-5 h-5 text-gold mt-1 shrink-0" />
                  <div>
                    <p className="text-primary-foreground font-medium">E-mail</p>
                    <a
                      href="mailto:contato@marciaboaventura.adv.br"
                      className="text-primary-foreground/70 hover:text-gold transition-colors"
                    >
                      contato@marciaboaventura.adv.br
                    </a>
                  </div>
                </div>
                <div className="flex items-start gap-4">
                  <Clock className="w-5 h-5 text-gold mt-1 shrink-0" />
                  <div>
                    <p className="text-primary-foreground font-medium">Horário de Atendimento</p>
                    <p className="text-primary-foreground/70">Segunda a Sexta: 9h às 18h</p>
                    <p className="text-primary-foreground/60 text-sm">Consultas com agendamento prévio</p>
                  </div>
                </div>
              </div>
            </div>

            <div>
              <h3 className="font-serif text-2xl text-primary-foreground mb-6">
                Credenciais
              </h3>
              <div className="space-y-4">
                <div className="glass-effect rounded-lg p-4">
                  <p className="text-gold font-medium mb-1">OAB/PR nº 129.081</p>
                  <p className="text-primary-foreground/70 text-sm">Ordem dos Advogados do Brasil - Seção Paraná</p>
                </div>
                <div className="glass-effect rounded-lg p-4">
                  <p className="text-primary-foreground font-medium mb-1">Áreas de Atuação</p>
                  <p className="text-primary-foreground/70 text-sm">Direito Civil • Direito de Família • Direito do Consumidor • Direito Criminal</p>
                </div>
                <div className="glass-effect rounded-lg p-4">
                  <p className="text-primary-foreground font-medium mb-1">Atendimento</p>
                  <p className="text-primary-foreground/70 text-sm">Presencial em Curitiba • Online em todo o Brasil</p>
                </div>
                <div className="glass-effect rounded-lg p-4 border border-gold/30">
                  <p className="text-gold font-bold mb-1">🚨 Atendimento de Flagrante 24h</p>
                  <p className="text-primary-foreground/70 text-sm">Plantão disponível para situações de urgência criminal</p>
                </div>
              </div>
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  );
};

export default Reviews;
