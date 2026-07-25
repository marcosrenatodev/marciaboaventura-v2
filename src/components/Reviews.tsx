import { motion } from "framer-motion";
import { useInView } from "framer-motion";
import { useEffect, useRef, useState } from "react";
import { Star, Quote, MapPin, Phone, Mail, Clock } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
} from "@/components/ui/carousel";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

const reviews = [
  {
    name: "Bruno rogerio Dos santos ferreira",
    rating: 5,
    text: "Bom ,estou aqui para parabenizar, o belo trabalho da doutora marcia boaventura..\nFoi Super atenciosa com meu caso, sempre me orientando,muito ágil, e preço bem acessível,super empenhada em resolver da melhor forma ..\nmuito obg pelo trabalho super indico\nMuito satisfeito, meu caso foi resolvido\nDEUS ABENÇOE, E MUITO SUCESSO VC MERECE..",
    date: "3 semanas atrás",
  },
  {
    name: "Natan CAP",
    rating: 5,
    text: "Só tenho a agradecer a\nDr Márcia pelo excelente atendimento, muito gentil, educada, dedicada, e honesta tirou todas minhas dúvidas, me deixou bem informado de tudo !\nDeixo aqui meus parabéns pela excelente profissional, que continue assim, essa eu recomendo com toda certeza.\nQue Deus abençoe 🙏",
    date: "2 meses atrás",
  },
  {
    name: "Josiane Machado",
    rating: 5,
    text: "Uma profissional excelência no q faz, sempre está ali pra ajuda seus clientes uma boa comunicação ótima advogada.",
    date: "2 meses atrás",
  },
  {
    name: "Janete de Fátima Guimarães Conceicao",
    rating: 5,
    text: "Uma excelente profissional , trabalhou com muita seriedade e competência.\nRecomendo.",
    date: "9 meses atrás",
  },
  {
    name: "Ivonete Mayer",
    rating: 5,
    text: "Tenho excelente experiência com a Dra Marcia profissional experiente e dedicada",
    date: "9 meses atrás",
  },
  {
    name: "Mara Regina",
    rating: 5,
    text: "Indico com total segurança e eficiência a Dra Márcia.\nAtenciosa e competente.\nMe ajudou muito no meu caso, do início ao fim esclarecendo minhas dúvidas.\nVocê estará bem representado pela Dr. Márcia Boaventura.",
    date: "10 meses atrás",
  },
  {
    name: "Alexandro Barros",
    rating: 5,
    text: "Doutora Márcia essa vai longe 🩵 obrigada\nPela dedicação no meu caso, tem\nMe ajudado muito. Super indico ✅",
    date: "10 meses atrás",
  },
  {
    name: "Marcos Renato Rocha de Medeiros",
    rating: 5,
    text: "Advogada excelente, me auxiliou num processo de cobrança indevida da minha graduação. Recomendo seus serviços.",
    date: "11 meses atrás",
  },
];

type Review = (typeof reviews)[number];

const ReviewStars = ({ rating }: Pick<Review, "rating">) => (
  <div className="flex gap-1" role="img" aria-label={`${rating} de 5 estrelas`}>
    {[...Array(rating)].map((_, index) => (
      <Star key={index} className="w-4 h-4 fill-gold text-gold" aria-hidden="true" />
    ))}
  </div>
);

const ReviewExcerpt = ({ review }: { review: Review }) => {
  const textRef = useRef<HTMLQuoteElement>(null);
  const [isTruncated, setIsTruncated] = useState(false);

  useEffect(() => {
    const textElement = textRef.current;

    if (!textElement) {
      return;
    }

    const checkTruncation = () => {
      setIsTruncated(textElement.scrollHeight > textElement.clientHeight + 1);
    };

    checkTruncation();
    const resizeObserver = new ResizeObserver(checkTruncation);
    resizeObserver.observe(textElement);

    return () => resizeObserver.disconnect();
  }, [review.text]);

  return (
    <>
      <blockquote
        ref={textRef}
        className="h-[6.5rem] line-clamp-4 whitespace-pre-line text-muted-foreground leading-relaxed italic"
      >
        {review.text}
      </blockquote>
      <div className="flex h-8 items-start">
        {isTruncated && (
          <Dialog>
            <DialogTrigger asChild>
              <button
                type="button"
                className="text-sm font-medium text-marsala underline-offset-4 transition-colors hover:text-gold hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                aria-label={`Ler avaliação completa de ${review.name}`}
              >
                Ler avaliação completa
              </button>
            </DialogTrigger>
            <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-xl">
              <DialogHeader className="pr-8">
                <DialogTitle className="font-serif text-2xl text-marsala">
                  Avaliação de {review.name}
                </DialogTitle>
                <DialogDescription>{review.date} no Google</DialogDescription>
              </DialogHeader>
              <ReviewStars rating={review.rating} />
              <blockquote className="whitespace-pre-line text-muted-foreground leading-relaxed italic">
                {review.text}
              </blockquote>
            </DialogContent>
          </Dialog>
        )}
      </div>
    </>
  );
};

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

        {/* Reviews Carousel */}
        <Carousel
          opts={{ align: "start" }}
          className="mx-auto mb-16 w-full px-10 md:px-12"
          aria-label="Avaliações de clientes"
        >
          <CarouselContent className="items-stretch">
            {reviews.map((review, index) => (
              <CarouselItem
                key={review.name}
                className="flex md:basis-1/2 xl:basis-1/3"
                aria-label={`${index + 1} de ${reviews.length}`}
              >
                <motion.div
                  initial={{ opacity: 0, y: 30 }}
                  animate={isInView ? { opacity: 1, y: 0 } : {}}
                  transition={{ duration: 0.6, delay: 0.4 + index * 0.08 }}
                  className="w-full"
                >
                  <Card className="card-elegant h-full border-none shadow-lg hover:shadow-xl transition-shadow duration-300">
                    <CardContent className="flex h-full flex-col p-6">
                      <Quote className="w-8 h-8 text-gold/30 mb-4" aria-hidden="true" />
                      <div className="mb-3">
                        <ReviewStars rating={review.rating} />
                      </div>
                      <ReviewExcerpt review={review} />
                      <footer className="mt-auto flex flex-col gap-1 border-t border-border/60 pt-4 sm:flex-row sm:items-end sm:justify-between sm:gap-4">
                        <p className="font-medium text-foreground">{review.name}</p>
                        <p className="shrink-0 text-sm text-muted-foreground">{review.date}</p>
                      </footer>
                    </CardContent>
                  </Card>
                </motion.div>
              </CarouselItem>
            ))}
          </CarouselContent>
          <CarouselPrevious
            className="left-0 border-gold/40 bg-background text-marsala hover:bg-gold hover:text-white"
            aria-label="Avaliação anterior"
          />
          <CarouselNext
            className="right-0 border-gold/40 bg-background text-marsala hover:bg-gold hover:text-white"
            aria-label="Próxima avaliação"
          />
        </Carousel>

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
                  <p className="text-primary-foreground/70 text-sm">Presencial em Almirante Tamandaré • Online em todo o Brasil</p>
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
