import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import { motion, AnimatePresence } from 'framer-motion';
import { useTranslation } from 'react-i18next';
export interface QuizQuestion {
  question: string;
  options: string[];
  correctAnswer: string;
}
interface QuizViewProps {
  questions: QuizQuestion[];
  onComplete: (score: number, total: number) => void;
}
const QuizView: React.FC<QuizViewProps> = ({ questions, onComplete }) => {
  const { t } = useTranslation();
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [selectedAnswers, setSelectedAnswers] = useState<Record<number, string>>({});
  const [showResult, setShowResult] = useState(false);
  const [score, setScore] = useState(0);
  const handleAnswerSelect = (answer: string) => {
    setSelectedAnswers((prev) => ({
      ...prev,
      [currentQuestionIndex]: answer,
    }));
  };
  const handleNext = () => {
    if (currentQuestionIndex < questions.length - 1) {
      setCurrentQuestionIndex(currentQuestionIndex + 1);
    } else {
      // Submit
      let currentScore = 0;
      questions.forEach((q, index) => {
        if (selectedAnswers[index] === q.correctAnswer) {
          currentScore++;
        }
      });
      setScore(currentScore);
      setShowResult(true);
      onComplete(currentScore, questions.length);
    }
  };
  const handleRetake = () => {
    setCurrentQuestionIndex(0);
    setSelectedAnswers({});
    setShowResult(false);
    setScore(0);
  };
  if (showResult) {
    return (
      <div className="text-center p-8">
        <CardTitle className="text-2xl mb-2">{t('apps.training.quizComplete')}</CardTitle>
        <p className="text-lg text-muted-foreground">
          {t('apps.training.yourScore')}: {score} / {questions.length}
        </p>
        <Button onClick={handleRetake} className="mt-4">
          {t('apps.training.retakeQuiz')}
        </Button>
      </div>
    );
  }
  const currentQuestion = questions[currentQuestionIndex];
  return (
    <div className="p-4 md:p-6">
      <AnimatePresence mode="wait">
        <motion.div
          key={currentQuestionIndex}
          initial={{ opacity: 0, x: 50 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -50 }}
          transition={{ duration: 0.3 }}
        >
          <Card>
            <CardHeader>
              <CardTitle>{t('apps.training.quizTitle')}</CardTitle>
              <CardDescription>
                {t('apps.training.question')} {currentQuestionIndex + 1} of {questions.length}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <p className="font-semibold mb-4 text-lg">{currentQuestion.question}</p>
              <RadioGroup
                value={selectedAnswers[currentQuestionIndex]}
                onValueChange={handleAnswerSelect}
              >
                {currentQuestion.options.map((option, index) => (
                  <div key={index} className="flex items-center space-x-2 p-2 rounded-md hover:bg-accent">
                    <RadioGroupItem value={option} id={`option-${index}`} />
                    <Label htmlFor={`option-${index}`} className="flex-1 cursor-pointer">{option}</Label>
                  </div>
                ))}
              </RadioGroup>
            </CardContent>
            <CardFooter>
              <Button
                onClick={handleNext}
                disabled={!selectedAnswers[currentQuestionIndex]}
                className="w-full"
              >
                {currentQuestionIndex < questions.length - 1
                  ? t('apps.training.nextQuestion')
                  : t('apps.training.submitQuiz')}
              </Button>
            </CardFooter>
          </Card>
        </motion.div>
      </AnimatePresence>
    </div>
  );
};
export default QuizView;