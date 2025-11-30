import React, { useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Button } from '@/components/ui/button';
import { PlayCircle, CheckCircle, BookOpen, Award, Trophy } from 'lucide-react';
import { useDesktopStore } from '@/stores/useDesktopStore';
import { useTranslation } from 'react-i18next';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import QuizView, { QuizQuestion } from './QuizView';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
interface Course {
  id: number;
  title: string;
  duration: string;
  completed: boolean;
  started: boolean;
  quiz: QuizQuestion[];
  badge: { icon: React.ElementType; name: string; color: string };
}
const mockCourses: Course[] = [
  {
    id: 1, title: 'Safety in Waste Handling', duration: '45 mins', completed: true, started: true,
    quiz: [
      { question: 'What is the most important piece of safety gear?', options: ['Gloves', 'Hat', 'Boots'], correctAnswer: 'Gloves' },
      { question: 'How should you lift heavy objects?', options: ['With your back', 'With your legs', 'Quickly'], correctAnswer: 'With your legs' },
    ],
    badge: { icon: Award, name: 'Safety Star', color: 'text-blue-500' }
  },
  {
    id: 2, title: 'Introduction to e-Waste Sorting', duration: '1 hour', completed: false, started: false,
    quiz: [
      { question: 'Which component contains valuable metals?', options: ['Plastic Casing', 'Circuit Boards', 'Glass Screen'], correctAnswer: 'Circuit Boards' },
      { question: 'Are batteries in e-waste hazardous?', options: ['Yes', 'No'], correctAnswer: 'Yes' },
    ],
    badge: { icon: Award, name: 'e-Waste Expert', color: 'text-green-500' }
  },
  {
    id: 3, title: 'Using the SuiteWaste OS', duration: '30 mins', completed: false, started: false,
    quiz: [
      { question: 'Where can you find all applications?', options: ['Taskbar', 'Start Menu', 'Desktop'], correctAnswer: 'Start Menu' },
      { question: 'How do you switch between open apps?', options: ['Using the Taskbar', 'Closing and reopening', 'Using the Start Menu'], correctAnswer: 'Using the Taskbar' },
    ],
    badge: { icon: Award, name: 'OS Pro', color: 'text-purple-500' }
  },
];
const leaderboardData = [
  { rank: 1, name: 'John Doe', points: 1500, avatar: '/avatars/01.png' },
  { rank: 2, name: 'Jane Smith', points: 1350, avatar: '/avatars/02.png' },
  { rank: 3, name: 'You', points: 1200, avatar: '/avatars/03.png' },
  { rank: 4, name: 'Sam Wilson', points: 1100, avatar: '/avatars/04.png' },
];
const TrainingApp: React.FC = () => {
  const { t } = useTranslation();
  const addNotification = useDesktopStore((state) => state.addNotification);
  const [courses, setCourses] = useState(mockCourses);
  const [activeCourse, setActiveCourse] = useState<Course | null>(null);
  const earnedBadges = useMemo(() => courses.filter(c => c.completed), [courses]);
  const handleStartCourse = (courseId: number) => {
    const courseToStart = courses.find(c => c.id === courseId);
    if (courseToStart) {
      setCourses(courses.map(c => c.id === courseId ? { ...c, started: true } : c));
      setActiveCourse(courseToStart);
      if (!courseToStart.started) {
        addNotification({
          appId: 'training',
          icon: BookOpen,
          title: 'Course Started',
          message: `You have started the "${courseToStart.title}" course.`,
        });
      }
    }
  };
  const handleQuizComplete = (score: number, total: number) => {
    if (activeCourse) {
      const passingScore = total * 0.75;
      if (score >= passingScore) {
        setCourses(courses.map(c => c.id === activeCourse.id ? { ...c, completed: true } : c));
        addNotification({
          appId: 'training',
          icon: CheckCircle,
          title: 'Course Completed!',
          message: `You passed the quiz for "${activeCourse.title}" with a score of ${score}/${total}.`,
        });
      } else {
        addNotification({
          appId: 'training',
          icon: BookOpen,
          title: 'Quiz Attempted',
          message: `You scored ${score}/${total}. Please try again to pass.`,
        });
      }
    }
  };
  return (
    <>
      <ScrollArea className="h-full">
        <div className="p-8">
          <header className="mb-8">
            <h1 className="text-3xl font-bold">{t('apps.training.title')}</h1>
            <p className="text-muted-foreground">{t('apps.training.description')}</p>
          </header>
          <Tabs defaultValue="courses">
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="courses">{t('apps.training.courses')}</TabsTrigger>
              <TabsTrigger value="leaderboard">{t('apps.training.leaderboard')}</TabsTrigger>
              <TabsTrigger value="badges">{t('apps.training.myBadges')}</TabsTrigger>
            </TabsList>
            <TabsContent value="courses" className="mt-4 space-y-4">
              {courses.map((course) => (
                <Card key={course.id}>
                  <CardContent className="p-4 flex items-center justify-between">
                    <div>
                      <CardTitle>{course.title}</CardTitle>
                      <p className="text-sm text-muted-foreground">{course.duration}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      {course.completed ? (
                        <span className="flex items-center gap-1 text-green-600 text-sm font-medium">
                          <CheckCircle size={16} /> {t('apps.training.completed')}
                        </span>
                      ) : (
                        <Button size="sm" onClick={() => handleStartCourse(course.id)}>
                          <PlayCircle size={16} className="mr-2" />
                          {course.started ? t('apps.training.resume') : t('apps.training.start')}
                        </Button>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </TabsContent>
            <TabsContent value="leaderboard">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2"><Trophy /> {t('apps.training.leaderboard')}</CardTitle>
                </CardHeader>
                <CardContent>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-[50px]">{t('apps.training.rank')}</TableHead>
                        <TableHead>{t('apps.training.user')}</TableHead>
                        <TableHead className="text-right">{t('apps.training.points')}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {leaderboardData.map((user) => (
                        <TableRow key={user.rank} className={user.name === 'You' ? 'bg-accent' : ''}>
                          <TableCell className="font-medium">{user.rank}</TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <Avatar className="h-8 w-8">
                                <AvatarImage src={user.avatar} alt={user.name} />
                                <AvatarFallback>{user.name.charAt(0)}</AvatarFallback>
                              </Avatar>
                              <span>{user.name}</span>
                            </div>
                          </TableCell>
                          <TableCell className="text-right">{user.points}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            </TabsContent>
            <TabsContent value="badges">
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                {earnedBadges.map(course => (
                  <Card key={course.id} className="flex flex-col items-center justify-center p-4 text-center">
                    <course.badge.icon size={48} className={course.badge.color} />
                    <p className="font-semibold mt-2">{course.badge.name}</p>
                    <p className="text-xs text-muted-foreground">{t('apps.training.earnedOn')} {new Date().toLocaleDateString()}</p>
                  </Card>
                ))}
                 {earnedBadges.length === 0 && (
                  <p className="col-span-full text-center text-muted-foreground py-8">{t('apps.training.noBadges')}</p>
                )}
              </div>
            </TabsContent>
          </Tabs>
        </div>
      </ScrollArea>
      <Dialog open={!!activeCourse} onOpenChange={(isOpen) => !isOpen && setActiveCourse(null)}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>{activeCourse?.title}</DialogTitle>
              <DialogDescription>{t('apps.training.quizDescription', { defaultValue: 'Answer the quiz to complete the course.' })}</DialogDescription>
            </DialogHeader>
            {activeCourse && (
              <QuizView
                questions={activeCourse.quiz}
                onComplete={handleQuizComplete}
              />
            )}
          </DialogContent>
      </Dialog>
    </>
  );
};
export default TrainingApp;