import { motion } from "framer-motion";
import { useInView } from "framer-motion";
import { useRef } from "react";
import { Scale, Users, ShoppingBag, Gavel } from "lucide-react";

const areas = [
  {
    icon: Scale,
    title: "Direito Civil",
    description: "Contratos, responsabilidade civil, direitos reais e obrigações.",
  },
  {
    icon: Users,
    title: "Direito das Famílias",
    description: "Divórcio, guarda, pensão alimentícia e inventários.",
  },
  {
    icon: ShoppingBag,
    title: "Direito do Consumidor",
    description: "Defesa dos seus direitos nas relações de consumo.",
  },
  {
    icon: Gavel,
    title: "Direito Penal",
    description: "Defesa criminal e acompanhamento processual completo.",
  },
];

const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.15,
    },
  },
};

const itemVariants = {
  hidden: { opacity: 0, y: 30 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.6, ease: "easeOut" as const },
  },
};

const PracticeAreas = () => {
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true, margin: "-100px" });

  return (
    <section id="areas" className="py-24 bg-background">
      <div className="container mx-auto px-6">
        {/* Section Header */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={isInView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.8 }}
          className="text-center max-w-2xl mx-auto mb-16"
        >
          <span className="text-gold font-medium text-sm tracking-widest uppercase mb-4 block">
            Especialidades
          </span>
          <h2 className="font-serif text-3xl md:text-4xl lg:text-5xl text-foreground mb-6">
            Áreas de <span className="text-marsala">Atuação</span>
          </h2>
          <div className="section-divider mx-auto mb-6" />
          <p className="text-muted-foreground">
            Oferecemos assessoria jurídica especializada e personalizada para atender suas necessidades.
          </p>
        </motion.div>

        {/* Cards Grid */}
        <motion.div
          ref={ref}
          variants={containerVariants}
          initial="hidden"
          animate={isInView ? "visible" : "hidden"}
          className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6"
        >
          {areas.map((area) => (
            <motion.div
              key={area.title}
              variants={itemVariants}
              className="card-elegant group p-8 rounded-lg shadow-lg hover:shadow-xl transition-shadow duration-500"
            >
              <div className="w-16 h-16 rounded-full bg-marsala/10 flex items-center justify-center mb-6 group-hover:bg-gold/20 transition-colors duration-500">
                <area.icon className="w-8 h-8 text-marsala group-hover:text-gold transition-colors duration-500" />
              </div>
              <h3 className="font-serif text-xl text-foreground mb-3 group-hover:text-marsala transition-colors duration-300">
                {area.title}
              </h3>
              <p className="text-muted-foreground text-sm leading-relaxed">
                {area.description}
              </p>
            </motion.div>
          ))}
        </motion.div>
      </div>
    </section>
  );
};

export default PracticeAreas;
