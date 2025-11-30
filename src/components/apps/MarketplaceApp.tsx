import React, { useState, useRef, useCallback } from 'react';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger, SheetFooter, SheetClose } from '@/components/ui/sheet';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useTranslation } from 'react-i18next';
import { Camera, Loader2, Link as LinkIcon, Share2 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
const mockItems = [
  { id: 1, name: 'Refurbished Laptops (x10)', price: 'R 15,000', category: 'E-Waste', image: '/ewaste/laptops.jpg' },
  { id: 2, name: 'Scrap Metal Bundle', price: 'R 5,000', category: 'Metals', image: '/ewaste/scrap.jpg' },
  { id: 3, name: 'Used Office Phones', price: 'R 2,500', category: 'E-Waste', image: '/ewaste/phones.jpg' },
  { id: 4, name: 'Recycled Plastic Pellets', price: 'R 8,000', category: 'Plastics', image: '/ewaste/pellets.jpg' },
];
const BlockchainVisualization = () => {
  const { t } = useTranslation();
  const blocks = [
    { id: '0', title: t('apps.marketplace.genesisBlock'), hash: '0xabc...' },
    { id: '1', title: t('apps.marketplace.tx') + ' #1', hash: '0xdef...' },
    { id: '2', title: t('apps.marketplace.tx') + ' #2', hash: '0xghi...' },
    { id: '3', title: t('apps.marketplace.tx') + ' #3', hash: '0xjkl...' },
  ];
  return (
    <div className="p-6">
      <div className="flex items-center justify-center space-x-2">
        {blocks.map((block, index) => (
          <React.Fragment key={block.id}>
            <motion.div
              initial={{ opacity: 0, scale: 0.5 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.5, delay: index * 0.3 }}
              className="bg-secondary p-3 rounded-lg text-center w-32"
            >
              <p className="font-bold text-sm flex items-center justify-center gap-1"><LinkIcon size={12} /> {block.title}</p>
              <p className="text-xs text-muted-foreground truncate">{block.hash}</p>
            </motion.div>
            {index < blocks.length - 1 && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.5, delay: index * 0.3 + 0.2 }}
              >
                <Share2 className="text-muted-foreground" />
              </motion.div>
            )}
          </React.Fragment>
        ))}
      </div>
    </div>
  );
};
const MarketplaceApp: React.FC = () => {
  const { t } = useTranslation();
  const [items, setItems] = useState(mockItems);
  const [newItem, setNewItem] = useState({ name: '', price: '', category: '', image: '' });
  const [isCameraOpen, setIsCameraOpen] = useState(false);
  const [isClassifying, setIsClassifying] = useState(false);
  const [isBlockchainOpen, setIsBlockchainOpen] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { id, value } = e.target;
    setNewItem((prev) => ({ ...prev, [id]: value }));
  };
  const handleCreateListing = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newItem.name || !newItem.price || !newItem.category) return;
    const newListing = {
      id: items.length + 1,
      ...newItem,
      price: `R ${parseFloat(newItem.price).toLocaleString()}`,
      image: newItem.image || '/ewaste/placeholder.jpg',
    };
    setItems([newListing, ...items]);
    setNewItem({ name: '', price: '', category: '', image: '' });
  };
  const startCamera = useCallback(async () => {
    if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
        }
      } catch (err) {
        console.error("Error accessing camera: ", err);
        alert("Could not access camera. Please check permissions.");
        setIsCameraOpen(false);
      }
    }
  }, []);
  const stopCamera = useCallback(() => {
    if (videoRef.current && videoRef.current.srcObject) {
      const stream = videoRef.current.srcObject as MediaStream;
      stream.getTracks().forEach(track => track.stop());
      videoRef.current.srcObject = null;
    }
  }, []);
  const handleCapture = () => {
    if (videoRef.current && canvasRef.current) {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const context = canvas.getContext('2d');
      context?.drawImage(video, 0, 0, canvas.width, canvas.height);
      const dataUrl = canvas.toDataURL('image/png');
      setNewItem(prev => ({ ...prev, image: dataUrl }));
      stopCamera();
      setIsCameraOpen(false);
      setIsClassifying(true);
      setTimeout(() => {
        setNewItem(prev => ({
          ...prev,
          name: 'Used Smartphone',
          category: 'E-Waste',
          price: '1200',
        }));
        setIsClassifying(false);
      }, 2000);
    }
  };
  return (
    <>
      <ScrollArea className="h-full">
        <div className="p-8">
          <header className="flex justify-between items-center mb-8">
            <div>
              <h1 className="text-3xl font-bold">{t('apps.marketplace.title')}</h1>
              <p className="text-muted-foreground">{t('apps.marketplace.description')}</p>
            </div>
            <Sheet>
              <SheetTrigger asChild>
                <Button>{t('apps.marketplace.createListing')}</Button>
              </SheetTrigger>
              <SheetContent>
                <SheetHeader>
                  <SheetTitle>{t('apps.marketplace.createListing')}</SheetTitle>
                </SheetHeader>
                <form onSubmit={handleCreateListing} className="py-4 space-y-4">
                  <Button type="button" variant="outline" className="w-full" onClick={() => setIsCameraOpen(true)}>
                    <Camera className="mr-2 h-4 w-4" /> {t('apps.marketplace.scanWithCamera')}
                  </Button>
                  {newItem.image && <img src={newItem.image} alt="Captured item" className="rounded-md border" />}
                  {isClassifying && (
                    <div className="flex items-center justify-center text-muted-foreground">
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      {t('apps.marketplace.classifying')}...
                    </div>
                  )}
                  <div className="space-y-2">
                    <Label htmlFor="name">Item Name</Label>
                    <Input id="name" value={newItem.name} onChange={handleInputChange} placeholder="e.g., Used Keyboards" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="price">Price (R)</Label>
                    <Input id="price" type="number" value={newItem.price} onChange={handleInputChange} placeholder="e.g., 500" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="category">Category</Label>
                    <Input id="category" value={newItem.category} onChange={handleInputChange} placeholder="e.g., E-Waste" />
                  </div>
                  <SheetFooter>
                    <SheetClose asChild>
                      <Button type="submit">Create</Button>
                    </SheetClose>
                  </SheetFooter>
                </form>
              </SheetContent>
            </Sheet>
          </header>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {items.map((item) => (
              <Card key={item.id} className="overflow-hidden flex flex-col">
                <CardHeader className="p-0">
                  <img src={item.image} alt={item.name} className="w-full h-40 object-cover" />
                </CardHeader>
                <CardContent className="p-4 flex-1">
                  <Badge variant="secondary" className="mb-2">{item.category}</Badge>
                  <CardTitle className="text-lg">{item.name}</CardTitle>
                </CardContent>
                <CardFooter className="flex justify-between items-center p-4 pt-0">
                  <span className="font-bold text-lg">{item.price}</span>
                  <Button variant="outline" size="sm" onClick={() => setIsBlockchainOpen(true)}>{t('apps.marketplace.viewOnBlockchain')}</Button>
                </CardFooter>
              </Card>
            ))}
          </div>
        </div>
      </ScrollArea>
      <Dialog open={isCameraOpen} onOpenChange={(open) => {
        setIsCameraOpen(open);
        if (open) startCamera();
        else stopCamera();
      }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('apps.marketplace.scanWithCamera')}</DialogTitle>
            <DialogDescription>{t('apps.marketplace.cameraDescription', { defaultValue: 'Use your camera to capture the item for listing.' })}</DialogDescription>
          </DialogHeader>
          <video ref={videoRef} autoPlay playsInline className="w-full h-auto rounded-md bg-black"></video>
          <canvas ref={canvasRef} className="hidden"></canvas>
          <DialogFooter>
            <Button onClick={handleCapture}>{t('apps.marketplace.capture')}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog open={isBlockchainOpen} onOpenChange={setIsBlockchainOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('apps.marketplace.transactionHistory')}</DialogTitle>
            <DialogDescription>{t('apps.marketplace.blockchainDescription', { defaultValue: 'View the transaction history visualization for this item.' })}</DialogDescription>
          </DialogHeader>
          <BlockchainVisualization />
        </DialogContent>
      </Dialog>
    </>
  );
};
export default MarketplaceApp;