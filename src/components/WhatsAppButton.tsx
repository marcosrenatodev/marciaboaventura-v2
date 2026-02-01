import { MessageCircle } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useState, useEffect } from "react";

const WhatsAppButton = () => {
  const [showMessage, setShowMessage] = useState(false);
  const [displayText, setDisplayText] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const fullMessage = "Fale comigo agora...";

  useEffect(() => {
    // Show message bubble after 3 seconds
    const showTimer = setTimeout(() => {
      setShowMessage(true);
      setIsTyping(true);
    }, 3000);

    return () => clearTimeout(showTimer);
  }, []);

  useEffect(() => {
    if (isTyping && showMessage) {
      let currentIndex = 0;
      const typingInterval = setInterval(() => {
        if (currentIndex <= fullMessage.length) {
          setDisplayText(fullMessage.slice(0, currentIndex));
          currentIndex++;
        } else {
          setIsTyping(false);
          clearInterval(typingInterval);
          
          // Hide message after 5 seconds, then show again
          setTimeout(() => {
            setShowMessage(false);
            setDisplayText("");
            
            // Restart animation after 10 seconds
            setTimeout(() => {
              setShowMessage(true);
              setIsTyping(true);
            }, 10000);
          }, 5000);
        }
      }, 80);

      return () => clearInterval(typingInterval);
    }
  }, [isTyping, showMessage]);

  return (
    <div className="whatsapp-float flex items-center gap-3">
      {/* Message Bubble */}
      <AnimatePresence>
        {showMessage && (
          <motion.div
            initial={{ opacity: 0, x: 20, scale: 0.8 }}
            animate={{ opacity: 1, x: 0, scale: 1 }}
            exit={{ opacity: 0, x: 20, scale: 0.8 }}
            transition={{ duration: 0.3, type: "spring" }}
            className="bg-white rounded-2xl rounded-br-sm shadow-lg px-4 py-3 max-w-[200px] relative"
          >
            <div className="text-gray-800 text-sm font-medium whitespace-nowrap">
              {displayText}
              {isTyping && (
                <motion.span
                  animate={{ opacity: [1, 0] }}
                  transition={{ duration: 0.5, repeat: Infinity }}
                  className="inline-block ml-0.5"
                >
                  |
                </motion.span>
              )}
            </div>
            {/* Typing dots */}
            {isTyping && displayText.length === 0 && (
              <div className="flex gap-1 items-center h-5">
                <motion.span
                  animate={{ y: [0, -4, 0] }}
                  transition={{ duration: 0.6, repeat: Infinity, delay: 0 }}
                  className="w-2 h-2 bg-gray-400 rounded-full"
                />
                <motion.span
                  animate={{ y: [0, -4, 0] }}
                  transition={{ duration: 0.6, repeat: Infinity, delay: 0.2 }}
                  className="w-2 h-2 bg-gray-400 rounded-full"
                />
                <motion.span
                  animate={{ y: [0, -4, 0] }}
                  transition={{ duration: 0.6, repeat: Infinity, delay: 0.4 }}
                  className="w-2 h-2 bg-gray-400 rounded-full"
                />
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* WhatsApp Button */}
      <motion.a
        href="https://wa.me/5541997085626"
        target="_blank"
        rel="noopener noreferrer"
        initial={{ scale: 0 }}
        animate={{ scale: 1 }}
        transition={{ delay: 2, duration: 0.5, type: "spring" }}
        className="w-14 h-14 bg-green-500 hover:bg-green-600 rounded-full flex items-center justify-center text-white transition-all duration-300 hover:scale-110 shadow-lg shadow-green-500/30"
        aria-label="Contato via WhatsApp"
      >
        <MessageCircle size={28} />
      </motion.a>
    </div>
  );
};

export default WhatsAppButton;
